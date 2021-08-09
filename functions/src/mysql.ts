/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import * as mysql from "mysql";
import * as functions from "firebase-functions";
import {v4 as uuidv4} from "uuid";


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
// god the callbackness of this has become worse and worse, i might have to fix this at some point
function makePaymentDb(senderId: string, recipientEmail: string, amount: number, message: string,
    callback: (success: string, results: any, fields: any) => void) : void {
    if (amount <=0) {
        callback("INVALID_AMOUNT", null, null);
        return;
    }
    const config = functions.config();
    const connection = mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        multipleStatements: true,
    },);

    getBalance(connection, senderId, function(balance, response) {
        if (balance - amount < 0) {
            if (response == "ERROR") {
                functions.logger.error("ERROR QUERYING DB FOR BALANCE");
                return;
                //  maybe call the callback here?
            } else {
                functions.logger.error("INSUFFICIENT FUNDS FOR PAYMENT");
                callback("INSUFFICIENT_FUNDS", null, null);
                return;
            }
        }

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

                        callback("ERROR", results, fields);
                        return;
                    });
                }

                connection.query("SET @recipient_id := 0; UPDATE User SET balance=balance+?, id = (SELECT @recipient_id := id) WHERE email = ?; SELECT @recipient_id AS recipient_id;",
                    [amount, recipientEmail],
                    function(error, results, fields) {
                        if (error) {
                            return connection.rollback(function() {
                                console.error(error);
                                functions.logger.info(error);
                                connection.end();

                                callback("ERROR", results, fields);
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
                                        functions.logger.info(error);

                                        console.error(error);
                                        callback("ERROR", results, fields);
                                        return;
                                    });
                                }
                                connection.commit(function(err) {
                                    if (err) {
                                        return connection.rollback(function() {
                                            connection.end();
                                            functions.logger.info(error);

                                            callback("ERROR", results, fields);
                                            throw err;
                                        });
                                    }
                                    // functions.logger.info("MADE COMPLETE PAYMENT TRANSACTION");
                                    callback("SUCCESS", results, fields);
                                    connection.end();
                                    return;
                                });
                            });
                    });
            });
        });
    } );
}

function getBalance(connection: any, id: string, callback: (balance: number, message: string) => void) : void {
    const sql = "SELECT balance FROM User where id = ?";
    const values = [id];
    connection.query(sql, values, (err: any, results: any, fields: any) => {
        if (err) {
            console.error(err);
            functions.logger.error("unable to query db with query: ", sql, "and values:", values);
            throw new Error("Query failed");
            callback(-1, "ERROR");
            return;
            // if (callback) callback(false, results, fields);
        } else {
            functions.logger.info("succesfully performed get balance query: " + sql +
                                            "\n with values: ", values);
            callback(results[0].balance, "SUCCESS");
            return;
            // return results[0].balance;
        }
        // connection.end();
    });
}


export { executeSql, makePaymentDb };

