'use strict';
var assert = require('assert');
var moesifapi = require('moesifapi');
var creatBatcher = require('../lib/batcher');
var moesif = require('../lib/index');
const { expect } = require('chai');
const crypto = require('crypto');

var RUN_TEST = true;

if (RUN_TEST) {
  describe('unit tests for sending actions', function () {
    this.timeout(10000);

    var middleWare = moesif({
      applicationId:
        '',
      debug: true,
      // debug: 'instrumentation',
    });

    it('send a single valid action', async function () {
      const actionName = "Clicked 'Sign up'";
      const actionMetadata = {
        button_label: 'Get Started',
        sign_up_method: 'Google SSO',
      };
      const actionReqContext = {
        uri: 'https://api.acmeinc.com/get-started/',
        ipAddress: '199.2.232.2',
      };
      const actionModel = {
        actionName: actionName,
        metadata: actionMetadata,
        request: actionReqContext,
      };
      middleWare.sendAction(actionModel, function (err, resp) {
        if (err) {
          console.log(err);
        } else {
        }
        done();
      });
    });

    it('send a batch of valid actions', async function () {
      var req_contextA = {
        time: new Date(),
        uri: 'https://api.acmeinc.com/items/reviews/',
        ipAddress: '69.48.220.123',
        userAgentString:
          'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0',
      };

      var req_contextB = {
        time: new Date(),
        uri: 'https://api.acmeinc.com/pricing/',
        ipAddress: '61.48.220.126',
        userAgentString: 'PostmanRuntime/7.26.5',
      };

      // Define the actions.
      var actions = [
        {
          transactionId: crypto.randomUUID(),
          actionName: 'Clicked Sign Up',
          sessionToken: '23abf0owekfmcn4u3qypxg09w4d8ayrcdx8nu2ng]s98y18cx98q3yhwmnhcfx43f',
          userId: crypto.randomInt(1, 1001),
          companyId: crypto.randomInt(1, 1001),
          metadata: {
            email: 'alex@acmeinc.com',
            button_label: 'Get Started',
            sign_up_method: 'Google SSO',
          },
          request: req_contextA,
        },

        {
          transactionId: crypto.randomUUID(),
          actionName: 'Viewed pricing',
          sessionToken: '23jdf0owejfmbn4u3qypxg09w4d8ayrxdx8nu2ng]s98y18cx98q3yhwmnhcfx43f',
          userId: crypto.randomInt(1, 1001),
          companyId: crypto.randomInt(1, 1001),
          metadata: {
            email: 'kim@acmeinc.com',
            button_label: 'See pricing',
            sign_up_method: 'Google SSO',
          },
          request: req_contextB,
        },
      ];

      middleWare.sendActionsBatch(actions, function (err, resp) {
        if (err) {
          console.log(err);
        } else {
        }
        done();
      });
    });

    it('throws error when sending a single action with invalid request field', async function () {
      const actionName = "Clicked 'Sign up'";
      const actionMetadata = {
        button_label: 'Get Started',
        sign_up_method: 'Google SSO',
      };
      // Request context empty that should throw an error
      const actionReqContext = {};
      const actionModel = {
        actionName: actionName,
        metadata: actionMetadata,
        request: actionReqContext,
      };
      try {
        await middleWare.sendAction(actionModel, () => {});
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.eql(
          'To send an Action, the request and request.uri fields are required'
        );
      }
    });

    it('throws error when sending a batch of actions with invalid request field', async function () {
      // Define the actions.
      var actions = [
        {
          transactionId: crypto.randomUUID(),
          actionName: 'Clicked Sign Up',
          sessionToken: '23abf0owekfmcn4u3qypxg09w4d8ayrcdx8nu2ng]s98y18cx98q3yhwmnhcfx43f',
          userId: crypto.randomInt(1, 1001),
          companyId: crypto.randomInt(1, 1001),
          metadata: {
            email: 'alex@acmeinc.com',
            button_label: 'Get Started',
            sign_up_method: 'Google SSO',
          },
          // Missing requried uri field
          request: {
            time: Date.now(),
            ipAddress: '12.48.120.123',
          },
        },

        {
          transactionId: crypto.randomUUID(),
          actionName: 'Viewed pricing',
          sessionToken: '23jdf0owejfmbn4u3qypxg09w4d8ayrxdx8nu2ng]s98y18cx98q3yhwmnhcfx43f',
          userId: crypto.randomInt(1, 1001),
          companyId: crypto.randomInt(1, 1001),
          metadata: {
            email: 'kim@acmeinc.com',
            button_label: 'See pricing',
            sign_up_method: 'Google SSO',
          },
          // Missing requried uri field
          request: {
            time: Date.now(),
            ipAddress: '12.48.220.123',
          },
        },
      ];
      try {
        await middleWare.sendActionsBatch(actions, () => {});
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.eql(
          'To send an Action, the request and request.uri fields are required'
        );
      }
    });
  });
}
