import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//

admin.initializeApp();
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


export const createUserDocument = functions.auth.user().onCreate((user) => {
  const db = admin.firestore();
  db.collection("User").doc(user.uid).set({
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    passwordHash: user.passwordHash,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    metadata: JSON.stringify(user.metadata),
    balance: 0.0,
  }).then(() => {
    functions.logger.info("Created new user document");
  }).catch((error) => {
    functions.logger.error("Error creating user: ", error);
  });
});

export const makePayment = functions.https.onCall(async (data) => {
  const db = admin.firestore();
  const message = data.message;
  const amount = data.amount;
  const senderUid = data.senderUid;
  const recipientUid = data.recipientUid;
  if (amount <= 0) {
    console.log(amount);
    throw new Error("Amount must be greater than 0");
  }
  const batch = db.batch();
  const senderDoc = db.collection("User").doc(senderUid);
  batch.update(senderDoc, {
    "balance": admin.firestore.FieldValue.increment(-amount),
  });

  const recipientDoc = db.collection("User").doc(recipientUid);


  batch.update(recipientDoc, {
    "balance": admin.firestore.FieldValue.increment(amount),
  });

  const payment = db.collection("Payment").doc();

  batch.set(payment, {
    senderUid: senderUid,
    recipientUid: recipientUid,
    amount: amount,
    message: message,
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
