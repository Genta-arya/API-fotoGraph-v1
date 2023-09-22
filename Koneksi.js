const mysql = require('mysql2');
const util = require('util');

const dbPool = mysql.createPool({
  host: 'bzizaxbwlogkymgc0hfm-mysql.services.clever-cloud.com',
  user: 'ud4bcst5oh325rxe',
  password: 'TiNeGhH0Bax414lNtHQ9',
  database: 'bzizaxbwlogkymgc0hfm',

});

function handleDisconnect() {
  dbPool.getConnection((err, connection) => {
    if (err) {
      console.error('Error connecting to MySQL:', err);
      setTimeout(handleDisconnect, 2000);
    } else {
      console.log('Connected to MySQL'); // This message will now be displayed
      connection.release();
    }
  });
}

// Call handleDisconnect to establish the initial connection
handleDisconnect();

dbPool.query = util.promisify(dbPool.query);

module.exports = dbPool;
