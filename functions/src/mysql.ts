import * as mysql from "mysql";
import * as functions from "firebase-functions";

const config = functions.config();

const connection = mysql.createConnection({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
});

connection.connect((err) => {
    if (err) {
        console.error(new Error("Unable to connect to database"));
        functions.logger.error("unable to connect to db");
        throw err;
    }
    functions.logger.info("connected to db succesfully");
    console.log("Connected!");
});

export { connection };

