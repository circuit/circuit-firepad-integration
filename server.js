// Server for hosting co-edit application
'use strict';
const randomstring = require('randomstring');
const fetch = require('node-fetch');
const OAuth2 = require('simple-oauth2');
const express = require('express');
const Session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const config  = require('./config.json');
const bot = require('./bot.js');
const app = express();
const INVALID_REQUEST = 'Sorry you are not authorized to view this session...';

// OAuth2 redirect uri
const PORT = process.env.PORT || config.host.port;
const redirectUri = `${config.host.url}${config.host.port ? ':' + PORT : ''}/oauthCallback`;
const usersAuthenticatedHashmap = {}; // Users haskmap for already authenticated users
// simple-oauth2 configuration
const oauth2 = OAuth2.create({
  client: {
    id: config.authCode.client_id,
    secret: config.authCode.client_secret
  },
  auth: {
    tokenHost: `https://${config.authCode.domain}`
  }
});

app.set('port', (process.env.PORT ||  config.host.port));
app.use('/conversation/:convId/session', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Setup express session
app.use(Session({
    secret: 'co-editing',
    resave: true,
    saveUninitialized: true
}));

// Where the application will be hosted
app.get('/conversation/:convId/session', (req, res) => {
    const session = bot.getSession(req.session.convId);
    if (session && session.participants.includes(req.session.userId) && session.tokens[req.session.userId] && usersAuthenticatedHashmap[req.userId]) {
        res.redirect('/');
    } else {
        res.redirect('reject.html');
    }
});

// Url users are taken to from link with convId, then are verified whether they can access the session
app.get('/conversation/:convId', (req, res) => {
    const convId = req.params.convId;
    const session = bot.getSession(convId);
    if (session) {
        if (req.session.token && session.tokens[req.session.userId] && session.participants.includes(req.session.userId) && usersAuthenticatedHashmap[req.session.userId]) {
            bot.addUserToSessionParticipants(req.session.convId, req.session.userId, usersAuthenticatedHashmap[req.session.userId].displayName);
            res.redirect(`/conversation/${convId}/session`);
        } else  {
            // Create state parameter to prevent CSRF attacks. Save in session.
            req.session.oauthState = randomstring.generate(12);
            req.session.convId = convId;

            // Redirect to OAuth2 authorize url
            const url = oauth2.authorizationCode.authorizeURL({
                redirect_uri: redirectUri,
                scope: config.authCode.scope,
                state: req.session.oauthState
            });
            res.redirect(url);
        }
    } else {
        res.send(INVALID_REQUEST);
    }
});

// Call back after users logs in with circuit credentials
// verifies the logged in user is a participant in the conversation
// grants user a token for firebase for one hour.
app.get('/oauthCallback', async (req, res) => {
    // Verify code is present and state matches to prevent CSRF attacks
    if (req.query.code && req.session.oauthState === req.query.state) {
      try {
        // Get the access token using the code
        const result = await oauth2.authorizationCode.getToken({
          code: req.query.code,
          redirect_uri: redirectUri
        });
        if (result.error) {
          throw new Error('Error getting access token', result.error_description);
        }
        const token = oauth2.accessToken.create(result).token;
        const user = await fetch(`https://${config.bot.domain}/rest/v2/users/profile`, {
          headers: { 'Authorization': 'Bearer ' +  token.access_token}
        }).then(res => res.json());
        usersAuthenticatedHashmap[user.userId] = {
            token: token,
            displayName: user.displayName || user.firstName
        };
        const session = bot.getSession(req.session.convId);
        if (session && session.participants.includes(user.userId)) {
            if (!req.session.token || req.session.token !== session.tokens[user.userId]) {
                // Token doesn't match the token in the hash map, create a new one for user
                req.session.token = await bot.createTokenForUser(user.userId, req.session.convId);
            }
            req.session.userId = user.userId;
            bot.addUserToSessionParticipants(req.session.convId, req.session.userId, usersAuthenticatedHashmap[req.session.userId].displayName);
            res.redirect(`/conversation/${req.session.convId}/session`);
        } else {
            // Redirect user to unauthorized page
            res.send(INVALID_REQUEST);
        }
      } catch (err) {
        console.error(err);
        res.send(INVALID_REQUEST);
      }
    } else {
        // Access denied
        res.send(INVALID_REQUEST);
    }
});

// Close the current session from the creator
app.post('/closesesssion', async (req, res) => {
    const session = bot.getSession(req.session.convId);
    if (session && req.session.userId === session.creatorId && req.session.token === session.tokens[req.session.userId]) {
        try {
            await bot.uploadDocument(session.convId);
            await bot.endSession(session.convId);
            res.status(200).send({ success: true });
        } catch (err) {
            res.status(400).send({ message: 'There was an error trying to close the session.', error: err});
        }
    } else {
        res.status(400).send({ message: 'You do not have permissions to end this session.'});
    }
});

// Gets the session data for client
app.get('/getsession', (req, res) => {
    const session = bot.getSession(req.session.convId);
    if (session && session.tokens[req.session.userId]) {
        // The session exists and the user has access to the conversation
        const data = {
            authenticated: true,
            conversation: req.session.convId,
            userId: req.session.userId,
            token: req.session.token,
            config: config.userFirebaseConfig,
            defaultText: session.defaultText
        };
        res.send(data);
    } else {
        // User session does not have a valid token
        res.status(400).send({ authenticated: false });
    }
});

// Initializes bot then starts the server
bot.initialize()
    .then(() => app.listen(app.get('port'), () => console.log(`App is listening at port: ${app.get('port')}`)))
    .catch(console.error);
