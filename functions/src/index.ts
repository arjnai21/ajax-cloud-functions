/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { executeSql } from "./mysql";

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//

admin.initializeApp();
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


export const createUser = functions.auth.user().onCreate((user) => {
    const insertSql = `INSERT INTO User (id, display_name, email, creation_time, password_hash, email_verified, phone_number, photo_url, balance)
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    if (!user.displayName) {
        user.displayName = user.email;
    }
    const values = [user.uid, user.displayName, user.email, user.metadata.creationTime, user.passwordHash,
        user.emailVerified, user.phoneNumber, user.photoURL, 0];

    executeSql(insertSql, values, (success, results, fields) => {
        functions.logger.info("ENTIRE CREATE USER FUNCTION COMPLETED");
    });
    // connection.end();

    //     connection;
    //     const db = admin.firestore();
    //     db.collection("User").doc(user.uid).set({
    //         uid: user.uid,
    //         displayName: user.displayName,
    //         email: user.email,
    //         phoneNumber: user.phoneNumber,
    //         passwordHash: user.passwordHash,
    //         photoURL: user.photoURL,
    //         emailVerified: user.emailVerified,
    //         metadata: JSON.stringify(user.metadata),
    //         balance: 0.0,
    //         friends: [],
    //     }).then(() => {
    //         functions.logger.info("Created new user document");
    //     }).catch((error) => {
    //         functions.logger.error("Error creating user: ", error);
    //     });
});

export const makePayment = functions.https.onCall(async (data) => {
    const db = admin.firestore();
    const message = data.message;
    const amount = data.amount;
    const senderUid = data.senderUid;
    const recipientEmail = data.recipientEmail;
    if (amount <= 0) {
        console.log(amount);
        throw new Error("Amount must be greater than 0");
    }
    const batch = db.batch();
    const senderDoc = db.collection("User").doc(senderUid);
    batch.update(senderDoc, {
        "balance": admin.firestore.FieldValue.increment(-amount),
    });

    const query = await db.collection("User")
        .where("email", "==", recipientEmail)
        .get();

    if (query.empty) {
        throw new Error("user with email \"" + recipientEmail + "\" does not exist");
    } else if (query.docs.length > 1) {
        throw new Error("too many users with email \"" + recipientEmail + "\"");
    }

    const recipientDoc = query.docs[0].ref;
    const recipientData = query.docs[0].data();
    const recipientUid = recipientData["uid"];
    const recipientDisplayName = recipientData["displayName"];


    batch.update(recipientDoc, {
        "balance": admin.firestore.FieldValue.increment(amount),
    });

    const payment = db.collection("Payment").doc();

    batch.set(payment, {
        senderUid: senderUid,
        recipientUid: recipientUid,
        recipientDisplayName: recipientDisplayName,
        amount: amount,
        message: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return batch.commit().then(() => {
        return {
            success: "true",
        };
    });
    // const recipientDoc = db.collection("User").doc(senderUid);

    // batch.update(recipientDoc, {
    //   "balance": FieldValue.increment(balance)
    // });

    // return {
    //   success: "true",
    // };

    // return ["Apple", "Banana", "Cherry", "Date", "Fig", "Grapes"];
});
