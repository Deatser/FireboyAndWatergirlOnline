import { auth, db, signInAsGuest } from './firebase-config.js'
import {
	signInWithCredential,
	PhoneAuthProvider,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js'
import {
	ref,
	set,
	update,
	serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'

const nicknameInput = document.getElementById('nickname')
const phoneInput = document.getElementById('phone')
const loginBtn = document.getElementById('loginBtn')
const registerBtn = document.getElementById('registerBtn')
const guestBtn = document.getElementById('guestBtn')

const testConfirmationCode = '123456'

// === Запись / обновление пользователя в базе ===
async function saveUser(uid, name, type, phone = null) {
	const userRef = ref(db, `users/${uid}`)
	await set(userRef, {
		name,
		type,
		isPlaying: false,
		lastSeen: serverTimestamp(),
		...(phone ? { phone } : {}),
	})
}

// === Обновление активности (для статистики) ===
function updateUserActivity(uid) {
	update(ref(db, `users/${uid}`), { lastSeen: serverTimestamp() })
}

// === После входа любого типа ===
async function afterLogin(user, name, type, phone = null) {
	const uid = user.uid

	localStorage.setItem('playerUid', uid)
	localStorage.setItem('playerName', name)
	localStorage.setItem('isGuest', type === 'guest')

	// Сохраняем / обновляем запись пользователя
	await saveUser(uid, name, type, phone)

	// Обновляем lastSeen каждые 30 секунд
	setInterval(() => updateUserActivity(uid), 30000)

	window.location.href = 'servers.html'
}

// === Авторизация по телефону (вход) ===
loginBtn.onclick = async () => {
	const phone = phoneInput.value.trim()
	if (!phone) return alert('Введите номер телефона')

	try {
		const credential = PhoneAuthProvider.credential(
			'fake-verification-id',
			testConfirmationCode
		)
		const userCredential = await signInWithCredential(auth, credential)
		const uid = userCredential.user.uid
		const nickname = nicknameInput.value.trim() || uid

		await afterLogin(userCredential.user, nickname, 'registered', phone)
	} catch (err) {
		console.error(err)
		alert('Ошибка входа: ' + err.message)
	}
}

// === Регистрация ===
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

		await afterLogin(userCredential.user, nickname, 'registered', phone)
	} catch (err) {
		console.error(err)
		alert('Ошибка регистрации: ' + err.message)
	}
}

// === Играть как гость ===
guestBtn.onclick = async () => {
	try {
		const user = await signInAsGuest()
		const guestName = 'Guest_' + user.uid.slice(-6)
		await afterLogin(user, guestName, 'guest')
	} catch (err) {
		console.error(err)
		alert('Ошибка анонимной регистрации: ' + err.message)
	}
}
