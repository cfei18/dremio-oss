/*
 * Copyright (C) 2017 Dremio Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.dremio.exec.planner.logical.serialization;

import java.io.ByteArrayOutputStream;
import java.util.List;

import org.apache.calcite.plan.RelOptCluster;
import org.apache.calcite.prepare.CalciteCatalogReader;
import org.apache.calcite.prepare.RelOptTableImpl;
import org.apache.calcite.rel.type.RelDataType;
import org.apache.calcite.sql.SqlOperator;
import org.apache.hadoop.io.Writable;
import org.objenesis.strategy.StdInstantiatorStrategy;

import com.dremio.exec.planner.logical.serialization.serializers.ImmutableCollectionSerializers;
import com.dremio.exec.planner.logical.serialization.serializers.JavaSerializers;
import com.dremio.exec.planner.logical.serialization.serializers.RelDataTypeSerializer;
import com.dremio.exec.planner.logical.serialization.serializers.RelOptNamespaceTableSerializer;
import com.dremio.exec.planner.logical.serialization.serializers.RelOptTableImplSerializer;
import com.dremio.exec.planner.logical.serialization.serializers.RelTraitDefSerializers;
import com.dremio.exec.planner.logical.serialization.serializers.RelTraitSerializers;
import com.dremio.exec.planner.logical.serialization.serializers.SqlOperatorSerializer;
import com.dremio.exec.planner.logical.serialization.serializers.StoragePluginSerializer;
import com.dremio.exec.planner.logical.serialization.serializers.TableMetadataSerializer;
import com.dremio.exec.planner.logical.serialization.serializers.WritableSerializer;
import com.dremio.exec.store.RelOptNamespaceTable;
import com.dremio.exec.store.StoragePlugin;
import com.dremio.exec.store.StoragePluginRegistry;
import com.dremio.exec.store.TableMetadata;
import com.esotericsoftware.kryo.Kryo;
import com.esotericsoftware.kryo.Serializer;
import com.esotericsoftware.kryo.factories.SerializerFactory;
import com.esotericsoftware.kryo.io.Input;
import com.esotericsoftware.kryo.io.Output;
import com.google.common.base.Preconditions;
import com.google.common.collect.Lists;


/**
 * A serializer used for reading and writing {@link org.apache.calcite.rel.RelNode}.
 *
 * Consumers must make sure that rels of interest are Kryo serializable.
 */
public class RelSerializer {
  private final Kryo kryo;
  private final InjectionMapping mapping;
  private final SerializerContext context;

  protected RelSerializer(final Kryo kryo, final InjectionMapping mapping, final SerializerContext context) {
    this.kryo = Preconditions.checkNotNull(kryo, "kryo is required");
    this.mapping = Preconditions.checkNotNull(mapping, "mapping is required");
    this.context = Preconditions.checkNotNull(context, "context is required");
  }

  protected void setup(final Kryo kryo) {
//    Log.TRACE();
    kryo.setWarnUnregisteredClasses(false);
    kryo.setInstantiatorStrategy(new Kryo.DefaultInstantiatorStrategy(new StdInstantiatorStrategy()));

    final StoragePluginSerializer pluginSerializer = new StoragePluginSerializer(context.getRegistry());
    kryo.setDefaultSerializer(new SerializerFactory() {
      @Override
      public Serializer makeSerializer(final Kryo kryo, final Class<?> type) {
        if (SqlOperator.class.isAssignableFrom(type)) {
          return SqlOperatorSerializer.of(kryo, type);
        }

        if (RelDataType.class.isAssignableFrom(type)) {
          return RelDataTypeSerializer.of(kryo, type, getContext().getCluster().getTypeFactory());
        }

        if (StoragePlugin.class.isAssignableFrom(type)) {
          return pluginSerializer;
        }

        if (Writable.class.isAssignableFrom(type)) {
          return new WritableSerializer();
        }

        return new InjectingSerializer(kryo, type, mapping);
      }
    });

    ImmutableCollectionSerializers.register(kryo);
    RelTraitDefSerializers.register(kryo);
    RelTraitSerializers.register(kryo);
    JavaSerializers.register(kryo);
    kryo.addDefaultSerializer(RelOptTableImpl.class, new RelOptTableImplSerializer(getContext().getCatalog()));
    kryo.addDefaultSerializer(RelOptNamespaceTable.class, new RelOptNamespaceTableSerializer(getContext().getCatalog(), getContext().getCluster()));
    kryo.addDefaultSerializer(TableMetadata.class, new TableMetadataSerializer(getContext().getCatalog()));

  }

  SerializerContext getContext() {
    return context;
  }

  public <T> byte[] serialize(final T plan) {
    final ByteArrayOutputStream outputStream = new ByteArrayOutputStream(context.getOutputBufferSize());
    try (final Output output = new Output(outputStream)) {
      kryo.writeObject(output, SerializationWrapper.of(plan));
    }
    return outputStream.toByteArray();
  }

  public <T> T deserialize(final byte[] data) {
    try (final Input input = new Input(data)) {
      final SerializationWrapper<T> plan = kryo.readObject(input, SerializationWrapper.class);
      return plan.getValue();
    }
  }

  public static Builder newBuilder(final Kryo kryo, final RelOptCluster cluster, final CalciteCatalogReader catalog,
                                   final StoragePluginRegistry registry) {
    return new Builder(kryo, cluster, catalog, registry);
  }

  private static class SerializationWrapper<T> {
    private final T value;

    public SerializationWrapper(final T value) {
      this.value = value;
    }

    public T getValue() {
      return value;
    }

    public static <T> SerializationWrapper<T> of(final T value) {
      return new SerializationWrapper<>(value);
    }
  }

  /**
   * A wrapper that holds serialization context for {@link RelSerializer}.
   */
  public static class SerializerContext {
    private final RelOptCluster cluster;
    private final CalciteCatalogReader catalog;
    private final StoragePluginRegistry registry;
    private final int outputBufferSize;

    protected SerializerContext(final RelOptCluster cluster, final CalciteCatalogReader catalog,
                             final StoragePluginRegistry registry, final int outputBufferSize) {
      this.cluster = cluster;
      this.catalog = catalog;
      this.registry = registry;
      this.outputBufferSize = outputBufferSize;
    }

    public RelOptCluster getCluster() {
      return cluster;
    }

    public CalciteCatalogReader getCatalog() {
      return catalog;
    }

    public StoragePluginRegistry getRegistry() {
      return registry;
    }

    public int getOutputBufferSize() {
      return outputBufferSize;
    }
  }

  /**
   * A {@link RelSerializer} builder.
   *
   * Builder injects the given cluster, catalog and registry by default.
   */
  public static class Builder {
    private final static int MAX_BUFFER_SIZE = 2 << 15;

    private final List<Injection> injections = Lists.newArrayList();
    private final Kryo kryo;
    private final RelOptCluster cluster;
    private final CalciteCatalogReader catalog;
    private final StoragePluginRegistry registry;
    private int outputBufferSize = MAX_BUFFER_SIZE;

    protected Builder(final Kryo kryo, final RelOptCluster cluster, final CalciteCatalogReader catalog,
                      final StoragePluginRegistry registry) {
      this.kryo = Preconditions.checkNotNull(kryo, "kryo is required");
      this.cluster = Preconditions.checkNotNull(cluster, "cluster is required");
      this.catalog = Preconditions.checkNotNull(catalog, "catalog is required");
      this.registry = Preconditions.checkNotNull(registry, "registry is required");
    }

    public <T> Builder withInjection(final Class<T> type, final T value) {
      return withInjection(Injection.of(type, value));
    }

    public Builder withInjection(final Injection injection) {
      injections.add(injection);
      return this;
    }

    public void setOutputBufferSize(final int outputBufferSize) {
      Preconditions.checkArgument(outputBufferSize > 0);
      this.outputBufferSize = outputBufferSize;
    }

    public RelSerializer build() {
      // ensure that we inject passed instances
      withInjection(RelOptCluster.class, cluster);
      withInjection(CalciteCatalogReader.class, catalog);
      withInjection(StoragePluginRegistry.class, registry);

      final InjectionMapping mapping = InjectionMapping.of(injections);
      final int bufferSize = Math.min(outputBufferSize, MAX_BUFFER_SIZE);
      final SerializerContext context = new SerializerContext(cluster, catalog, registry, bufferSize);
      final RelSerializer serializer = new RelSerializer(kryo, mapping, context);
      serializer.setup(kryo);
      return serializer;
    }

  }

}
