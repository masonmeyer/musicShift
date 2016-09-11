var mongoose = require('mongoose'),
  Schema = mongoose.Schema;

var TrackSchema = new Schema({
  votes: { type: Number, default: 0 },
  playing: { type: Boolean, default: false },
  queued: { type: Boolean, default: true },
  added_at: { type: Date, default: Date.now },
  started_playing_at: Date,
  spotify_track_id: String
});

module.exports = mongoose.model('Track', TrackSchema);
