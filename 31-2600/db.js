var mongo = require('mongodb').MongoClient;
var DB = null;
var dbURL = 'mongodb://localhost:3000';

function connect(cb){
	mongoClient.connect(DB,function(error,seeded){
    if(error){
    	console.log('cannot connect to the server',DB);
    	throw error;
    	else{
    		DB=seeded;
    		cb(DB);
    	}
    	});
	};
exports.connect = function(cb) {
    
};

/**
 * used to get access to the db object to query the database
 * throws an error if db not initialized.
 * example use case assuming you required the module as db
 *     db.db().find(.... etc
 * @return {MongoDBObject} 
 */
exports.db = function() {
    if (DB === null) throw Error('DB Object has not yet been initialized');
    return DB;
};

/**
 * clears all collections in the database calling the callback when done
 * @param  {Function} done callback indicating the operation is complete
 */
exports.clearDB = function(done) {
    DB.listCollections().toArray().then(function (collections) {
        collections.forEach(function (c) {
        	 DB.collection(c.name).removeMany();   
        });
        done();
    }).catch(done);
};