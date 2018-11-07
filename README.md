circuit-firepad-integration
==================================

## Description
Type `/start co-edit` in a conversation to start a firepad document collaboration session either on an attachment or a new document (only supports text documents right now). Only users of the conversation will be able to join the session. The bot will monitor any conversation it is in and manage the co-edit sessions it creates. The application is implemented using the circuit-sdk as well as express to run the server. The application uses firepad to allow for co-editing of the document, you can find firepad at [https://firepad.io](https://firepad.io) if you are interested in using it for other applications.

## Requirements
[![NodeJS](https://img.shields.io/badge/Node.js-^7.6.0-brightgreen.svg)](https://nodejs.org) <br/>
* Developer account on circuitsandbox.net. Get it for free at [developer registration](https://circuit.github.io/).
* OAuth 2.0 authorization code `client_id` and `client_secret`. Get if for free at [https://yourcircuit.typeform.com/to/sxOjAg](https://yourcircuit.typeform.com/to/sxOjAg).
* Client credentials for bot `client_id` and optionally `client_secret`. Get if for free at [https://yourcircuit.typeform.com/to/sxOjAg](https://yourcircuit.typeform.com/to/sxOjAg).
* Requires firebase API keys for their real time database you can get it from [https://console.firebase.google.com](https://console.firebase.google.com) for the client side application since firepad uses it for syncing the documents. You will need to select  `Project settings` which can be found by clicking the cog next to `Project Overview`. After doing so select `Add Firebase to your web app` and those credentials will be used for the client side firebase application.
* Requires firebase admin API keys for their real time database you can get it from [https://console.firebase.google.com](https://console.firebase.google.com). You can obtain a user by going to the firebase console and navigating to `Users and permissions` (can also be found by clicking the cog next to Project Overview). After going there select the `Service accounts` tab and generate a new private key, these will be your credentials for the firebase admin user.

## Usage
1. Clone the respository.
2. Run : `$ npm install`.
3. Rename `config.json.template` to `config.json` after adding your circuit and firebase credentials. You will also need to add the firebase realtime database rules to your rules in the firebase console. The rules needed for this application are in `firebase-rules-template` file. You can add this to the rules of your firebase.console database rules. The rules can be added by going to, in the firebase console, Database then selecting rules then add the security rules there.
4. Then Run `$npm start` and the bot will monitor any conversation it is in and manage sessions when a user of the conversation types `/start co-edit`. If a text document is uploaded with the item that is added it will begin the session with that text document. When the session ends the document will be posted to the conversation.
* Note: The creator, the user who types `/start co-edit`, can end the session by typing `/stop co-edit` in the conversation or in the application itself. The session will also end automatically and the document will be uploaded once all users have left the session. 
* Note: The bot must be a part of the conversation it is listening to.

## Demo
You can view a demo of this application here.
[![picture](https://img.youtube.com/vi/h9y7qKKCs-M/0.jpg)](https://www.youtube.com/watch?v=h9y7qKKCs-M)