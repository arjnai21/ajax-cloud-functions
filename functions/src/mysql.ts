/* eslint-disable require-jsdoc */
import * as mysql from "mysql";
import * as functions from "firebase-functions";


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
    });
    connection.end();
}


export { executeSql };

