"use strict";
var assert = require("assert");
var moesifapi = require("moesifapi");
var creatBatcher = require("../lib/batcher");
var moesif = require("../lib/index");

var CompanyModel = moesifapi.CompanyModel;

var RUN_TEST = true;

if (RUN_TEST) {
  describe("unit tests for updating companies or users", function () {
    this.timeout(10000);

    var middleWare = moesif({
      applicationId: "test application id",
      debug: true
      // debug: 'instrumentation',
    });

    it("verify toJSON converts camelCase to snake_case for Company predefined fields", function () {
      const camelCasedCompany = {
        companyId: "helloThere",
        ipAddress: "199.2.232.2",
        companyDomain: "hello.com"
      };

      const companyModel = new CompanyModel(camelCasedCompany);

      const resultOfToJSON = companyModel.toJSON();
      console.log(JSON.stringify(resultOfToJSON));
      // console of companyModel
      console.log(JSON.stringify(companyModel));
    }); // end of it

    it("test update company batch", function (done) {
      const batchCamelCasedCompany = [
        {
          companyId: "twitch",
          ipAddress: "199.2.232.2",
          companyDomain: "twitch.com",
          metadata: {
            name: "dude"
          }
        },
        {
          companyId: "doc",
          ipAddress: "199.2.232.2",
          companyDomain: "stuff.com",
          metadata: {
            name: "stuff"
          }
        }
      ];;

      middleWare.updateCompaniesBatch(
        batchCamelCasedCompany,
        function (err, success) {
          if (err) {
            console.log(err);
          } else {
          }
          done();
        }
      );
    }); // end of it

    it("update single company", function (done) {
      const singleCamelCasedCompany = {
        companyId: "helloThere",
        ipAddress: "199.2.232.2",
        companyDomain: "hello.com"
      };

      middleWare.updateCompany(
        singleCamelCasedCompany,
        function (err, success) {
          if (err) {
            console.log(err);
          } else {
          }
          done();
        }
      );
    }); // end of it

    // }); // end of it
  }); // end of describe
} // end of if(RUN_TEST)
