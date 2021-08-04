/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import * as mysql from "mysql";
import * as functions from "firebase-functions";
import {v4 as uuidv4} from "uuid";


// const connection = mysql.createConnection({
//     host: config.db.host,
//     user: config.db.user,
//     password: config.db.password,
//     database: config.db.database,
// });

// connection.connect((err) => {
//     if (err) {
//         console.error(err);
//     }
//     functions.logger.info("connected to db succesfully");
//     console.log("Connected.");
// });

// maybe it's a bad to idea to connect to this thing every time. if so, let me know. thanks.
function executeSql(sql: string, values?: Array<any>, callback?: (success: boolean, results: any, fields: any) => void) : void {
    const config = functions.config();
    const connection = mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
    });
    connection.query(sql, values, (err, results, fields) => {
        if (err) {
            console.error(err);
            functions.logger.error("unable to query db with query: ", sql, "and values:", values);
            if (callback) callback(false, results, fields);
        } else {
            functions.logger.info("succesfully performed query: " + sql +
                                            "\n with values: ", values);
            functions.logger.info(results);
            functions.logger.info(fields);
            if (callback) callback(true, results, fields);
        }
        connection.end();
    });
}

// i should maybe call callback before i rollback
// welcome to callback hell
function makePaymentDb(senderId: string, recipientEmail: string, amount: number, message: string,
    callback: (success: boolean, results: any, fields: any) => void) : void {
    const config = functions.config();
    const connection = mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        multipleStatements: true,
    },);

    connection.beginTransaction(function(err) {
        if (err) {
            console.error(err);
            connection.end();

            return;
        }
        connection.query("UPDATE User SET balance=balance-? WHERE id=?", [amount, senderId], function(error, results, fields) {
            if (error) {
                return connection.rollback(function() {
                    console.error(error);
                    connection.end();

                    callback(false, results, fields);
                    return;
                });
            }
            // next query here
            //             SET @LastUpdateID := 0;
            // UPDATE tbl SET Name = 'value_new',Rno = (SELECT @LastUpdateID := Rno)
            //    WHERE Name = 'value3';
            // SELECT @LastUpdateID AS LastUpdateID;
            // update balance with email and get id back hopefully
            connection.query("SET @recipient_id := 0; UPDATE User SET balance=balance+?, id = (SELECT @recipient_id := id) WHERE email = ?; SELECT @recipient_id AS recipient_id;",
                [amount, recipientEmail],
                function(error, results, fields) {
                    if (error) {
                        return connection.rollback(function() {
                            console.error(error);
                            connection.end();

                            callback(false, results, fields);
                            return;
                        });
                    }

                    const id = uuidv4();
                    // third result because third statement, 0 because idk it's just in an array
                    const recipientId = results[2][0].recipient_id;

                    // functions.logger.info("ID: " + id);
                    connection.query("INSERT INTO Payment (id, amount, message, sender_id, recipient_id) VALUES(?, ?, ?, ?, ?)",
                        [id, amount, message, senderId, recipientId],
                        function(error, results, fields) {
                            if (error) {
                                return connection.rollback(function() {
                                    connection.end();

                                    console.error(error);
                                    callback(false, results, fields);
                                    return;
                                });
                            }
                            connection.commit(function(err) {
                                if (err) {
                                    return connection.rollback(function() {
                                        connection.end();

                                        callback(false, results, fields);
                                        throw err;
                                    });
                                }
                                // functions.logger.info("MADE COMPLETE PAYMENT TRANSACTION");
                                callback(true, results, fields);
                                connection.end();
                            });
                        });
                });
        });
    });
}


export { executeSql, makePaymentDb };

