require('dotenv').config();

var keyBy = require('lodash/keyBy');

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGOLAB_URI || process.env.MONGODB_URI);
var Track = require('./models/track');

var SpotifyWebApi = require('spotify-web-api-node');
var spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

var app = require('koa')();
var router = require('koa-router')();
var bodyParser = require('koa-body')();
var cors = require('koa-cors')({ origin: true });

// FIXME - why u storin state in the main process fam?
// because u cray.
var pendingSkip = false;

function serializeTrack(track, spotifyTrack) {
  if (!spotifyTrack) {
    spotifyTrack = {
      name: 'Unknown name',
      artists: [{ name: 'Unknown artist' }],
      album: { images: [{ url: 'https://placekitten.com/300/300' }] }
    };
  }

  return {
    id: track._id,
    spotify_track_id: spotifyTrack.id,
    name: spotifyTrack.name,
    artist: spotifyTrack.artists.map(a => a.name).join(', '),
    image: spotifyTrack.album.images[0].url,
    playing: track.playing,
    votes: track.votes,
    started_playing_at: track.started_playing_at,
    duration_ms: spotifyTrack.duration_ms
  }
}

app.use(cors);

app.use(function *(next) {
  try {
    yield next;
  } catch (err) {
    this.status = err.status || 500;
    this.body = err.message;
    this.app.emit('error', err, this);
  }
});

router.get('/queue', function *(next) {
  var tracks = yield Track.find({
      spotify_track_id: { $exists: true },
      $or: [
        { playing: true },
        { queued: true }
      ]
    })
    .sort([['playing', -1], ['votes', -1], ['added_at', 1]])
    .exec();

  var spotifyTracks = tracks.length ? yield spotifyApi.getTracks(tracks.map(t => t.spotify_track_id)) : { body: { tracks: [] } },
    spotifyTracksById = keyBy(spotifyTracks.body.tracks, 'id');

  this.body = tracks.map(t => serializeTrack(t, spotifyTracksById[t.spotify_track_id]));
});

router.post('/add', bodyParser, function *(next) {
  var track = new Track({
    spotify_track_id: this.request.body.spotify_track_id,
    votes: 1 // Initial suggester votes in favor
  });
  yield track.save();

  this.body = { success: true };
});

router.post('/upvote', bodyParser, function *(next) {
  var track = yield Track.findOne({ _id: this.request.body.id }).exec();
  track.votes++;
  yield track.save();
  this.body = { success: true };
});

router.post('/downvote', bodyParser, function *(next) {
  var track = yield Track.findOne({ _id: this.request.body.id }).exec();

  if (track.votes === 1) {
    // Delete a track from the queue if it has 0 votes
    yield track.remove();
  } else {
    track.votes--;
    yield track.save();
  }

  this.body = { success: true };
});

router.post('/search', bodyParser, function *(next) {
  var query = this.request.body.query;

  if (!query) {
    this.body = [];
    return;
  }

  var spotifyResults = yield spotifyApi.searchTracks(query);
  this.body = spotifyResults.body.tracks.items.map(r => serializeTrack({}, r));
});

router.post('/skip', function *(next) {
  pendingSkip = true;
  this.body = { success: true };
});

router.post('/device/next_track', function *(next) {
  var oldTrack = yield Track.findOne({
    playing: true
  }).exec();

  if (oldTrack) {
    yield oldTrack.remove();
  }

  var nextTracks = yield Track.find({ queued: true })
    .sort([['votes', -1], ['added_at', 1]])
    .limit(1)
    .exec(),
    nextTrack = nextTracks.length && nextTracks[0];

  if (nextTrack) {
    nextTrack.playing = true;
    nextTrack.queued = false;
    nextTrack.started_playing_at = Date.now();
    yield nextTrack.save();
    this.body = { track: nextTrack.spotify_track_id };
  } else {
    this.body = { track: null };
  }
});

router.post('/device/check_skip', function *(next) {
  this.body = { skip: pendingSkip };
  pendingSkip = false;
});

app
  .use(router.routes())
  .use(router.allowedMethods());

var port = process.env.PORT || 3020;
app.listen(port, () => {
  console.log('Server listening at %s', port);
});
