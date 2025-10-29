// index.js
import { auth, db, signInAsGuest } from './firebase-config.js'
import {
	signInAnonymously,
	signInWithCredential,
	PhoneAuthProvider,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js'
import {
	ref,
	set,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'

// Элементы страницы
const nicknameInput = document.getElementById('nickname')
const phoneInput = document.getElementById('phone')
const loginBtn = document.getElementById('loginBtn')
const registerBtn = document.getElementById('registerBtn')
const guestBtn = document.getElementById('guestBtn')

// --- Локальный UID для тестовой эмуляции SMS ---
const testConfirmationCode = '123456' // Тестовый код для эмулятора

// Вход по телефону через эмулятор
loginBtn.onclick = async () => {
	const phone = phoneInput.value.trim()
	if (!phone) return alert('Введите номер телефона')

	try {
		// Эмулятор: создаём credential без SMS
		const credential = PhoneAuthProvider.credential(
			'fake-verification-id',
			testConfirmationCode
		)
		const userCredential = await signInWithCredential(auth, credential)

		const uid = userCredential.user.uid
		const nickname = nicknameInput.value.trim() || uid

		localStorage.setItem('playerUid', uid)
		localStorage.setItem('playerName', nickname)
		localStorage.setItem('isGuest', 'false')

		window.location.href = 'servers.html'
	} catch (err) {
		console.error(err)
		alert('Ошибка входа: ' + err.message)
	}
}

// Регистрация по телефону + ник через эмулятор
registerBtn.onclick = async () => {
	const phone = phoneInput.value.trim()
	const nickname = nicknameInput.value.trim()
	if (!phone || !nickname) return alert('Введите ник и номер телефона')

	try {
		const credential = PhoneAuthProvider.credential(
			'fake-verification-id',
			testConfirmationCode
		)
		const userCredential = await signInWithCredential(auth, credential)
		const uid = userCredential.user.uid

		// Сохраняем в базе пользователей
		await set(ref(db, `users/${uid}`), {
			nickname: nickname,
			phone: phone,
		})

		localStorage.setItem('playerUid', uid)
		localStorage.setItem('playerName', nickname)
		localStorage.setItem('isGuest', 'false')

		window.location.href = 'servers.html'
	} catch (err) {
		console.error(err)
		alert('Ошибка регистрации: ' + err.message)
	}
}

// Играть как гость
guestBtn.onclick = async () => {
	try {
		await signInAsGuest() // <-- вызов единой функции из firebase-config.js
		window.location.href = 'servers.html'
	} catch (err) {
		console.error(err)
		alert('Ошибка анонимной регистрации: ' + err.message)
	}
}
