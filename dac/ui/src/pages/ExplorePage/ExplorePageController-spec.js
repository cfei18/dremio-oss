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
import { shallow } from 'enzyme';
import Immutable from 'immutable';

import { ExplorePageControllerComponent, getNewDataset } from './ExplorePageController';

describe('ExplorePageController', () => {
  let commonProps;
  let minimalProps;
  beforeEach(() => {
    const location = {
      pathname: '/space/resource/name'
    };
    minimalProps = {
      sqlState: true,
      updateSqlPartSize: sinon.spy(),
      hideUnsavedChangesModal: sinon.spy(),
      updateGridSizes: sinon.spy(),
      performLoadDataset: sinon.spy(),
      setCurrentSql: sinon.spy(),
      resetViewState: sinon.spy(),
      previewJobResults: sinon.spy(),
      exploreViewState: Immutable.Map(),
      rightTreeVisible: true,
      location,
      pageType: 'default',
      dataset: getNewDataset({query: {context: '@dremio'}}),
      needsLoad: false
    };
    commonProps = {
      ...minimalProps,
      route: {
        path: '/new_query'
      },
      dataset: Immutable.fromJS({
        datasetVersion: '11',
        sql: '23',
        fullPath: ['newSpace', 'newTable'],
        displayFullPath: ['displaySpace', 'displayTable']
      }),
      initialDatasetVersion: '11',
      currentSql: '23',
      history: Immutable.Map({tipVersion: '11'}),
      router: {
        push: sinon.spy(),
        setRouteLeaveHook: sinon.spy()
      }
    };
  });

  describe('rendering', () => {
    it('should render with minimal props', () => {
      const wrapper = shallow(<ExplorePageControllerComponent {...minimalProps} />);
      expect(wrapper).to.have.length(1);
    });
  });

  describe('#componentWillReceiveProps', () => {
    let wrapper;
    let instance;
    let props;
    beforeEach(() => {
      props = {
        ...commonProps,
        history: Immutable.Map()
      };
      wrapper = shallow(<ExplorePageControllerComponent {...props}/>);
      instance = wrapper.instance();
    });

    it('should not load anything if !nextProps.dataset.needsLoad && !isFailed && !haveNewDatasetVersion', () => {
      instance.componentWillReceiveProps(props);
      expect(commonProps.performLoadDataset).to.not.be.called;
    });

    it('should load when needsLoad has changed to true', () => {
      wrapper.setProps(props);
      commonProps.performLoadDataset.reset();
      wrapper.setProps({...props, dataset: props.dataset.merge({needsLoad: true})});
      expect(commonProps.performLoadDataset).to.be.called;

      commonProps.performLoadDataset.reset();
      wrapper.setProps({...props, dataset: props.dataset.merge({datasetVersion: undefined, needsLoad: false})});
      expect(commonProps.performLoadDataset).to.not.be.called;

      wrapper.setProps({...props, dataset: props.dataset.merge({datasetVersion: '01', needsLoad: false})});
      expect(commonProps.performLoadDataset).to.not.be.called;
    });

    it('should load when DS version has changed, and needsLoad, regardless of previous needsLoad', () => {
      wrapper.setProps({...props, dataset: props.dataset.merge({datasetVersion: '00'})});
      expect(commonProps.performLoadDataset).to.not.be.called;
      wrapper.setProps({...props, dataset: props.dataset.merge({datasetVersion: '00', needsLoad: true})});
      expect(commonProps.performLoadDataset).to.be.called;

      commonProps.performLoadDataset.reset();
      wrapper.setProps({...props, dataset: props.dataset.merge({datasetVersion: '01', needsLoad: true})});
      expect(commonProps.performLoadDataset).to.be.called;

      commonProps.performLoadDataset.reset();
      wrapper.setProps({...props, dataset: props.dataset.merge({datasetVersion: '02', needsLoad: false})});
      expect(commonProps.performLoadDataset).to.not.be.called;
    });

    it('should call resetViewState and setCurrentSql(undefined) only if datasetVersion has changed', () => {
      instance.componentWillReceiveProps(props);
      expect(commonProps.resetViewState).to.not.be.called;
      expect(commonProps.setCurrentSql).to.not.be.called;

      props = {...props, dataset: props.dataset.set('datasetVersion', '22')};
      instance.componentWillReceiveProps(props);
      expect(commonProps.resetViewState).to.be.called;
      expect(commonProps.setCurrentSql).to.be.calledWith({sql: undefined});
    });
    it('should call router.setRouteLeaveHook only if route has changed', () => {
      instance.componentWillReceiveProps(props);
      expect(props.router.setRouteLeaveHook).to.not.be.called;
      props = {...props, route: { path: '/:resources' }};
      instance.componentWillReceiveProps(props);
      expect(props.router.setRouteLeaveHook).to.be.called;
    });

    it('should redirect to / if props/.pageType is invalid', () => {
      instance.componentWillReceiveProps({...props, pageType: 'foo'});
      expect(props.router.push).to.be.calledWith('/');
    });
  });

  describe('#shouldComponentUpdate', () => {
    let wrapper;
    let instance;
    beforeEach(() => {
      wrapper = shallow(<ExplorePageControllerComponent {...commonProps}/>);
      instance = wrapper.instance();
    });

    it('should return false if nothing changed', () => {
      expect(instance.shouldComponentUpdate(commonProps)).to.be.false;
    });

    it('should return true if new dataset !equals old dataset', () => {
      expect(instance.shouldComponentUpdate(
        {...commonProps, dataset: commonProps.dataset.set('foo', 'bar')}
      )).to.be.true;
    });

    it('should return if prop in propKeys has changed', () => {
      expect(instance.shouldComponentUpdate(
        {...commonProps, pageType: 'differentPageType'}
      )).to.be.true;
    });
  });

  describe('Showing unsaved changes popup', () => {
    let wrapper;
    let instance;
    const showConfirmationDialogStub = sinon.stub();
    beforeEach(() => {
      const props = {
        ...commonProps,
        showConfirmationDialog: showConfirmationDialogStub
      };
      wrapper = shallow(<ExplorePageControllerComponent {...props}/>);
      instance = wrapper.instance();
    });

    it('should allow navigation when nothing changed', () => {
      const nextLocation = { pathname: '/' };
      sinon.stub(instance, 'shouldShowUnsavedChangesPopup').returns(false);
      expect(instance.routeWillLeave(nextLocation)).to.be.true;
      expect(wrapper.state('isUnsavedChangesModalShowing')).to.be.false;
      expect(showConfirmationDialogStub).to.not.be.called;
    });

    it('should prevent navigation when dataset changed and store next location', () => {
      const nextLocation = { pathname: '/' };
      sinon.stub(instance, 'shouldShowUnsavedChangesPopup').returns(true);
      expect(instance.routeWillLeave(nextLocation)).to.be.false;
      expect(wrapper.state('nextLocation')).to.be.eql(nextLocation);
      expect(wrapper.state('isUnsavedChangesModalShowing')).to.be.true;
      expect(showConfirmationDialogStub).to.be.calledOnce;
    });

    it('should allow navigation when dataset changed and modal confirmed', () => {
      const nextLocation = { pathname: '/' };
      wrapper.setState({ isUnsavedChangesModalShowing: true });
      sinon.stub(instance, 'shouldShowUnsavedChangesPopup').returns(true);
      expect(instance.routeWillLeave(nextLocation)).to.be.true;
      expect(showConfirmationDialogStub).to.be.calledOnce;
    });
  });

  describe('#_areLocationsSameDataset', () => {
    let wrapper;
    let instance;
    let history;
    beforeEach(() => {
      wrapper = shallow(<ExplorePageControllerComponent {...commonProps}/>);
      instance = wrapper.instance();
      history = Immutable.fromJS({
        items: []
      });
    });

    it('should return true if 3rd path element is equal', () => {
      expect(
        instance._areLocationsSameDataset(
          history, {pathname: '/space/foo/a.b.c/foo'}, {pathname: '/space/foo/a.b.c/details'}
        )
      ).to.be.true;
      expect(
        instance._areLocationsSameDataset(
          history, {pathname: '/space/foo/a.b.c/details'}, {pathname: '/space/foo/different'})
      ).to.be.false;
    });

    it('should return true if newLocation is tmp.UNTITLED', () => {
      expect(
        instance._areLocationsSameDataset(history, {pathname: '/space/foo/a.b.c'}, {pathname: '/space/tmp/UNTITLED'})
      ).to.be.true;
      expect(
        instance._areLocationsSameDataset(history, {pathname: '/space/foo/a.b.c'}, {pathname: '/space/foo/UNTITLED'})
      ).to.be.false;
    });

    it('should return true next version is previous in history', () => {
      expect(
        instance._areLocationsSameDataset(
          history.set('items', Immutable.fromJS(['456', '123'])),
          {pathname: '/space/tmp/UNTITLED'},
          {pathname: '/space/foo/a.b.c', query: {version: '123'}}
        )
      ).to.be.true;
      expect(
        instance._areLocationsSameDataset(
          history.set('items', Immutable.fromJS(['456', '123'])),
          {pathname: '/space/foo/a.b.c'},
          {pathname: '/space/foo/UNTITLED'}
        )
      ).to.be.false;
    });
  });

  describe('#shouldShowUnsavedChangesPopup', () => {
    let wrapper;
    let instance;
    beforeEach(() => {
      wrapper = shallow(<ExplorePageControllerComponent {...commonProps}/>);
      instance = wrapper.instance();
    });

    it('should return false when already confirmed', () => {
      const nextLocation = {pathname: '/', query: {tipVersion: commonProps.history.get('tipVersion')}};
      wrapper.setProps({currentSql: '123'});
      expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.true;
      instance.discardUnsavedChangesConfirmed = true;
      expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.false;
    });

    describe('when tipVersion is unchanged', () => {
      it('should return true only if sql changed', () => {
        const nextLocation = {pathname: '/', query: {tipVersion: commonProps.history.get('tipVersion')}};
        expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.false;
        wrapper.setProps({currentSql: '123'});
        expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.true;
      });
    });

    describe('when tipVersion is changed', () => {
      const nextLocation = {pathname: '/', query: {tipVersion: 'newVersion'}};
      describe('and sql is changed', () => {
        it('should return true only if _areLocationsSameDataset is false', () => {
          wrapper.setProps({currentSql: '123'});
          sinon.stub(instance, '_areLocationsSameDataset').returns(true);
          expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.false;
          instance._areLocationsSameDataset.returns(false);
          expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.true;
        });
      });

      describe('and sql is not changed', () => {
        it('should return true only if history.isEdited', () => {
          wrapper.setProps({history: undefined});
          expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.false;
          wrapper.setProps({history: Immutable.Map({tipVersion: '123', isEdited: false})});
          expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.false;
          wrapper.setProps({history: Immutable.Map({tipVersion: '123', isEdited: true})});
          expect(instance.shouldShowUnsavedChangesPopup(nextLocation)).to.be.true;
        });
      });
    });
  });
});
