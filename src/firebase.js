import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBPuvwpQR8my1rRHDPD2QuJqNoubk0AUzg",
  authDomain: "poll-app-fad16.firebaseapp.com",
  projectId: "poll-app-fad16",
  storageBucket: "poll-app-fad16.firebasestorage.app",
  messagingSenderId: "218106186137",
  appId: "1:218106186137:web:ed34ae01ba68247375eb08",
  measurementId: "G-94L14QEXPR"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();