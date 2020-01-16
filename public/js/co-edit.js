Vue.component('co-edit', {
    props: {
      firebase: {
        default: {},
        type: Object
      },
      user: {
        default: '',
        type: String
      },
      text: {
        default: '',
        type: String
      }
    },
    template: `<div ref="firepad"></div>`,
    data: function () {
      return {
        firepad: null
      }
    },
    watch: {
      firepad: function () {} // watch the firepad, needed for init
    },
    created: function () {
      this.$nextTick(() => {
        const firepadRef = this.firebase.child('document');
        const cm = CodeMirror(this.$refs.firepad, { lineWrapping: false });
        // Create Firepad with userId being their circuit user id.
        this.firepad = Firepad.fromCodeMirror(firepadRef, cm, { userId: this.user });
        this.firepad.on('ready', () => {
          // this is because if you set a multiline document as the default text
          // the length of the string in the document in firebase does not match
          // the length of the document displayed on the client side.
          // this is only to initialize the document, it will work after that...
          const defaultText = cm.getValue();
          if (!defaultText.length && this.text !== defaultText) {
            this.firepad.setText(this.text);
          }
        });
      });
    }
});