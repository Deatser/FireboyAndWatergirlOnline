// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js'
import {
	getDatabase,
	connectDatabaseEmulator,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'
import {
	getAuth,
	signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js'

// Конфигурация Firebase
const firebaseConfig = {
	apiKey: 'AIzaSyA97jyxJ5qP0K7G4KkO1k-evatCVhXd5tk',
	authDomain: 'fireboyandwatergirl-2025.firebaseapp.com',
	projectId: 'fireboyandwatergirl-2025',
	storageBucket: 'fireboyandwatergirl-2025.appspot.com',
	messagingSenderId: '170066412791',
	appId: '1:170066412791:web:f1ad4c374958f702d77ff2',
	databaseURL:
		'https://fireboyandwatergirl-2025-default-rtdb.europe-west1.firebasedatabase.app',
}

// Инициализация Firebase
const app = initializeApp(firebaseConfig)

// Realtime Database
export const db = getDatabase(app)

// Подключение к локальному эмулятору Realtime Database
connectDatabaseEmulator(db, 'localhost', 9000)
console.log('Подключение к эмулятору Realtime Database')

// Firebase Auth
export const auth = getAuth(app)
console.log('Firebase Auth готов')

// Функция анонимного входа (гость)
export async function signInAsGuest() {
	try {
		const userCredential = await signInAnonymously(auth)
		const uid = userCredential.user.uid

		let guestName = localStorage.getItem('guestName')
		if (!guestName) {
			guestName = 'guest_' + Math.floor(Math.random() * 1000000)
			localStorage.setItem('guestName', guestName)
		}

		localStorage.setItem('playerUid', uid)
		localStorage.setItem('playerName', guestName)
		localStorage.setItem('isGuest', 'true')

		console.log('Анонимный вход выполнен:', uid, guestName)
		return { uid, guestName }
	} catch (err) {
		console.error('Ошибка анонимного входа:', err)
		throw err
	}
}
