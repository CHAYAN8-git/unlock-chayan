import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyChyXBSBysnXV4KKeNy750-9te_XVxWe8Q",
  authDomain: "unlock-chayan.firebaseapp.com",
  databaseURL: "https://unlock-chayan-default-rtdb.firebaseio.com",
  projectId: "unlock-chayan",
  storageBucket: "unlock-chayan.firebasestorage.app",
  messagingSenderId: "1008448475464",
  appId: "1:1008448475464:web:e71b60867d0872460aa37d",
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);