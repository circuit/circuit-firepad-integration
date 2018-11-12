var app = new Vue({
  el: '#app',
  data: {
    convId: null,
    token: null,
    userId: null,
    config: null,
    loaded: false,
    ref: null,
    isCreator: false,
    sessionEnded: false,
    text: null
  },
  created: function () {
    this.getSession()
      .then(() => {
        // Initialize Firebase.
        firebase.initializeApp(this.config);
        return firebase.auth().signInWithCustomToken(this.token);
      })
      .then(() => {
          // Get Firebase Database reference.
          const db = firebase.database().ref(); // reference to root of db
          this.ref = db.child(`sessions/${this.convId}`);
      })
      .then(() => this.ref.once('value'))
      .then(snap => snap.val().creatorId === this.userId ? this.isCreator = true : this.isCreator = false)
      .then(() => this.addEventListeners())
      .then(() => this.loaded = true)
      .catch(console.error);
  },
  methods: {
    addEventListeners: function () {
      this.ref.on('child_removed', snap => {
        if (snap.key === 'document') {
          // document has been removed and session is over, display session is over
          this.sessionEnded = true;
          firebase.auth().signOut()
            .then(() => console.log('Successfully logged out of firebase'))
            .catch(console.error);
        }
      });
    },
    getSession: function () {
      return fetch('/getsession')
        .then(res => res.json())
        .then(data => {
          this.convId = data.conversation;
          this.token = data.token;
          this.userId = data.userId;
          this.config = data.config;
          this.text = data.defaultText;
          if (!data.authenticated) {
            this.sessionEnded = true;
            throw new Error('Session has already ended...');
          }
        })
        .catch(console.error);
    },
    endSession: function () {
      debugger;
      fetch('/closesesssion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ convId: this.convId })
      })
      .then(res => res.json())
      .then(success => console.log('Response from server', success))
      .catch(console.error);
    }
  }
});