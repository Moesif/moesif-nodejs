"use strict";
var assert = require("assert");
var moesifapi = require("moesifapi");
var creatBatcher = require("../lib/batcher");
var moesif = require("../lib/index");

var CompanyModel = moesifapi.CompanyModel;

var RUN_TEST = false;

if (RUN_TEST) {
  describe("unit tests for updating companies or users", function () {
    this.timeout(10000);

    var middleWare = moesif({
      applicationId: "test id",
      debug: true
      // debug: 'instrumentation',
    });

    it("verify toJSON converts camelCase to snake_case for Company predefined fields", function () {
      const camelCasedCompany = {
        companyId: "randomId" + Math.random(),
        ipAddress: "199.2.232.2",
        companyDomain: "hello.com"
      };

      const companyModel = new CompanyModel(camelCasedCompany);

      const resultOfToJSON = companyModel.toJSON();
      console.log(JSON.stringify(resultOfToJSON));
      // console of companyModel
      console.log(JSON.stringify(companyModel));
    }); // end of it

    it("update single company", function (done) {
      const singleCamelCasedCompany = {
        companyId: "randomId" + Math.random(),
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

    it("update single company promise", function () {
      const singleCamelCasedCompany = {
        companyId: "randomId" + Math.random(),
        ipAddress: "199.2.232.2",
        companyDomain: "hello.com"
      };

      return middleWare.updateCompany(singleCamelCasedCompany);
    }); // end of it

    it("update company batch", function (done) {
      const batchCamelCasedCompany = [
        {
          companyId: "randomId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyDomain: "twitch.com",
          metadata: {
            name: "dude"
          }
        },
        {
          companyId: "randomId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyDomain: "stuff.com",
          metadata: {
            name: "stuff"
          }
        }
      ];

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

    it("update company batch promise", function () {
      const batchCamelCasedCompany = [
        {
          companyId: "randomId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyDomain: "twitch.com",
          metadata: {
            name: "dude"
          }
        },
        {
          companyId: "randomId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyDomain: "stuff.com",
          metadata: {
            name: "stuff"
          }
        }
      ];

      return middleWare.updateCompaniesBatch(batchCamelCasedCompany);
    }); // end of it

    it("update single user", function (done) {
      const singleCamelCasedUser = {
        userId: "userId" + Math.random(),
        ipAddress: "199.2.232.2",
        companyId: "helloThere"
      };

      middleWare.updateUser(singleCamelCasedUser, function (err, success) {
        if (err) {
          console.log(err);
        } else {
        }
        done();
      });
    }); // end of it

    it("update single user promise", function () {
      const singleCamelCasedUser = {
        userId: "userId" + Math.random(),
        ipAddress: "199.2.232.2",
        companyId: "helloThere"
      };

      return middleWare.updateUser(singleCamelCasedUser);
    }); // end of it

    it("update user batch", function (done) {
      const camelCasedUsersArray = [
        {
          userId: "userId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyId: "helloThere"
        },
        {
          userId: "userId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyId: "helloThere",
          metadata: {
            name: "you",
            first_name: "hello"
          }
        }
      ];

      middleWare.updateUsersBatch(
        camelCasedUsersArray,
        function (err, success) {
          if (err) {
            console.log(err);
          } else {
          }
          done();
        }
      );
    }); // end of it

    it("update user batch promise", function () {
      const camelCasedUsersArray = [
        {
          userId: "userId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyId: "helloThere"
        },
        {
          userId: "userId" + Math.random(),
          ipAddress: "199.2.232.2",
          companyId: "helloThere",
          metadata: {
            name: "you",
            first_name: "hello"
          }
        }
      ];

      return middleWare.updateUsersBatch(camelCasedUsersArray);
    }); // end of it
  }); // end of describe
} // end of if(RUN_TEST)
