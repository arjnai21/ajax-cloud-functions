/* eslint-disable @typescript-eslint/ban-ts-comment */
"use strict";

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as cookieParserLib from "cookie-parser";
import * as corsLib from "cors";
import { executeSql, makePaymentDb } from "./mysql";

// admin.initializeApp();
const cookieParser = cookieParserLib();
const cors = corsLib({origin: true});
const app = express();

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
    makePaymentDb(req.body.senderId, req.body.recipientId, req.body.amount, req.body.message, function(success, results, fields) {
        if (success) {
            res.json({success: true, message: "payment successful"});
        } else {
            res.json({sucess: false, message: "unable to make payment"});
        }
    });
});

app.get("/getPayments", (req, res) => {
    const sql = "SELECT * from Payment WHERE sender_id=? or recipient_id=?";
    const values = [req.user.uid, req.user.uid];

    executeSql(sql, values, (success, results, fields) => {
        // console.assert(results.length == 1);
        res.json({payments: results});
    });
});

// This HTTPS endpoint can only be accessed by your Firebase Users.
// Requests need to be authorized by providing an `Authorization` HTTP header
// with value `Bearer <Firebase ID Token>`.
export {app};
