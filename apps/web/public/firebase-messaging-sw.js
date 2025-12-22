importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "YOUR_API_KEY_PLACEHOLDER", // Replace if you have the key, otherwise keep placeholder
  authDomain: "the-gamut-v2.firebaseapp.com",
  projectId: "the-gamut-v2",
  storageBucket: "the-gamut-v2.appspot.com",
  messagingSenderId: "336894099757",
  appId: "1:336894099757:web:fb0c37f0775530722c8872",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
