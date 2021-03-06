/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable max-len*/
"use strict";

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as cookieParserLib from "cookie-parser";
import * as corsLib from "cors";
import {Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products} from "plaid";
import { executeSql, makePaymentDb } from "./mysql";

// admin.initializeApp();
const cookieParser = cookieParserLib();
const cors = corsLib({origin: true});
const app = express();
const config = functions.config();
const plaidConfig = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
        headers: {
            "PLAID-CLIENT-ID": config.plaid.client_id,
            "PLAID-SECRET": config.plaid.secret_sandbox,
        },
    },
});
const plaidClient = new PlaidApi(plaidConfig);


//  copied from https://github.com/firebase/functions-samples/blob/main/authorized-https-endpoint/functions/index.js
// Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
// The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
// `Authorization: Bearer <Firebase ID Token>`.
// when decoded successfully, the ID Token content will be added as `req.user`.

// @ts-ignore
const validateFirebaseIdToken = async (req, res, next) => {
    functions.logger.log("Check if request is authorized with Firebase ID token");

    if ((!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) &&
      !(req.cookies && req.cookies.__session)) {
        functions.logger.error(
            "No Firebase ID token was passed as a Bearer token in the Authorization header.",
            "Make sure you authorize your request by providing the following HTTP header:",
            "Authorization: Bearer <Firebase ID Token>",
            "or by passing a \"__session\" cookie."
        );
        res.status(403).send("Unauthorized");
        return;
    }

    let idToken;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        functions.logger.log("Found \"Authorization\" header");
        // Read the ID Token from the Authorization header.
        idToken = req.headers.authorization.split("Bearer ")[1];
    } else if (req.cookies) {
        functions.logger.log("Found \"__session\" cookie");
        // Read the ID Token from cookie.
        idToken = req.cookies.__session;
    } else {
    // No cookie
        res.status(403).send("Unauthorized");
        return;
    }

    try {
        const decodedIdToken = await admin.auth().verifyIdToken(idToken);
        functions.logger.log("ID Token correctly decoded", decodedIdToken);
        req.user = decodedIdToken;
        next();
        return;
    } catch (error) {
        functions.logger.error("Error while verifying Firebase ID token:", error);
        res.status(403).send("Unauthorized");
        return;
    }
};

app.use(cors);
app.use(cookieParser);
app.use(validateFirebaseIdToken);
app.get("/getUser", (req, res) => {
    const sql = "SELECT * from User WHERE id=?";
    const values = [req.user.uid];

    executeSql(sql, values, (success, results, fields) => {
        console.assert(results.length == 1);
        res.json(results[0]);
    });
});

app.post("/makePayment", (req, res) => {
    if (req.body.amount <= 0) {
        res.json({success: false, message: "INVALID_AMOUNT"});
        return;
    }
    makePaymentDb(req.body.senderId, req.body.recipientEmail, req.body.amount, req.body.message,
        function(message, results, fields) {
            let successResp; let messageResp;
            if (message == "SUCCESS") {
                successResp = true;
                messageResp = "SUCCESS";
            } else if (message=="INSUFFICIENT_FUNDS") {
                successResp = false;
                messageResp = "INSUFFICIENT_FUNDS";
            } else {
                successResp = false;
                messageResp = "UNKNOWN_ERROR";
            }
            res.json({success: successResp, message: messageResp});
        });
});
/*
SELECT
  Payment.amount, Payment.message, Payment.timestamp, RecipientUser.email AS recipient_email, SenderUser.email AS sender_email
FROM Payment
  INNER JOIN User RecipientUser ON Payment.recipient_id = RecipientUser.id
  INNER JOIN User SenderUser ON Payment.sender_id = SenderUser.id
  ORDER BY timestamp;
*/
// TODO check if this is the right join
app.get("/getPayments", (req, res) => {
    const sql = `
                SELECT
                    Payment.amount, Payment.message, Payment.timestamp, RecipientUser.email AS recipient_email, SenderUser.email AS sender_email
                FROM Payment
                    INNER JOIN User RecipientUser ON Payment.recipient_id = RecipientUser.id
                    INNER JOIN User SenderUser ON Payment.sender_id = SenderUser.id
                WHERE (recipient_id=? OR sender_id=?)
                    ORDER BY timestamp DESC;`;
    const values = [req.user.uid, req.user.uid];

    executeSql(sql, values, (success, results, fields) => {
        if (success) {
            res.json({payments: results});
        } else {
            res.json({payments: [], error: "Error retrieving payments from server."});
        }
    });
});


app.get("/getPlaidLinkToken", async (req, res) => {
    const request = {
        user: {
            client_user_id: req.user.uid,
        },
        client_name: "Ajax",
        products: [Products.Auth],
        country_codes: [CountryCode.Us],
        language: "en",
        // webhook: "https://sample.webhook.com",
    };

    try {
        const response = await plaidClient.linkTokenCreate(request);
        functions.logger.info("LINK TOKEN RESPONSE: " + response);
        const linkToken = response.data.link_token;
        res.json({success: true, link_token: linkToken});
    } catch (error) {
        // handle error
        functions.logger.error(error);
        res.status(500);
        res.json({success: false});
    }
});

app.post("/exchangePublicToken", async (req, res) => {
    const request = {
        public_token: req.body.publicToken,
    };

    try {
        const response = await plaidClient.itemPublicTokenExchange(request);
        functions.logger.info("LINK TOKEN RESPONSE: " + response);
        const accessToken = response.data.access_token;
        // store accesstoken
        const sql = "UPDATE User WHERE id=? SET plaid_access_token=?";
        const values = [req.user.uid, accessToken];
        executeSql(sql, values, (success, results, fields) => {
            if (success) {
                res.json({success: true});
            } else {
                res.status(500);
                res.json({success: false});
            }
        });
    } catch (error) {
        // handle error
        functions.logger.error(error);
        res.status(500);
        res.json({success: false});
    }
});


// This HTTPS endpoint can only be accessed by your Firebase Users.
// Requests need to be authorized by providing an `Authorization` HTTP header
// with value `Bearer <Firebase ID Token>`.
export {app};
