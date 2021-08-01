/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { executeSql } from "./mysql";
import {app} from "./api";

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//

admin.initializeApp();
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


export const createUser = functions.auth.user().onCreate((user) => {
    const insertSql = `INSERT INTO User (id, display_name, email, creation_time, 
        password_hash, email_verified, phone_number, photo_url, balance) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    if (!user.displayName) {
        user.displayName = user.email;
    }
    const values = [user.uid, user.displayName, user.email, user.metadata.creationTime, user.passwordHash,
        user.emailVerified, user.phoneNumber, user.photoURL, 0];

    executeSql(insertSql, values);
});

export const api = functions.https.onRequest(app);
