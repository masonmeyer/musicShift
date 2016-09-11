#!/usr/bin/env python

from __future__ import unicode_literals

import threading
import base64

import spotify
import requests
from socketIO_client import SocketIO, LoggingNamespace


ENDPOINT = 'http://10.251.75.147:8083/device/next_track'
socketIO = SocketIO('10.251.75.147', 8083, LoggingNamespace)

# Assuming a spotify_appkey.key in the current dir
session = spotify.Session()

# Process events in the background
loop = spotify.EventLoop(session)
loop.start()

# Connect an audio sink
# audio = spotify.AlsaSink(session)
audio = spotify.PortAudioSink(session)

# Events for coordination
logged_in = threading.Event()
needs_track = threading.Event()
needs_track.set()  # Start needing a new event


def on_skip():
    print 'skip!'
    needs_track.set()


def on_connection_state_updated(session):
    if session.connection.state is spotify.ConnectionState.LOGGED_IN:
        logged_in.set()


def on_end_of_track(self):
    needs_track.set()


# Register event listeners
session.on(
    spotify.SessionEvent.CONNECTION_STATE_UPDATED, on_connection_state_updated)
session.on(spotify.SessionEvent.END_OF_TRACK, on_end_of_track)
socketIO.on('skip', on_skip)

session.login('theopolisme', base64.b64decode('QTczTnJlZXNl'))

logged_in.wait()

try:
    while True:
        if needs_track.wait(0.1):
            print 'Fetching new track'
            needs_track.clear()
            track_uri = requests.post(ENDPOINT).json()['track']
            if track_uri:
                track = session.get_track('spotify:track:' + track_uri).load()
                session.player.load(track)
                session.player.play()
            else:
                print 'Couldn\'t find a track, looking again'
                needs_track.set()


except KeyboardInterrupt:
    pass
