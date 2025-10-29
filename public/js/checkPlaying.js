import { db } from './firebase-config.js'
import {
	ref,
	get,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js'

// Скрываем тело страницы до проверки
document.addEventListener('DOMContentLoaded', () => {
	document.body.style.display = 'none'
})

export async function redirectIfPlaying() {
	const playerUid = localStorage.getItem('playerUid')
	if (!playerUid) {
		document.body.style.display = 'block'
		return
	}

	try {
		const snap = await get(ref(db, `users/${playerUid}/isPlaying`))
		const isPlaying = snap.val()
		if (isPlaying) {
			window.location.replace('game.html')
		} else {
			document.body.style.display = 'block'
		}
	} catch (err) {
		console.error('Ошибка проверки isPlaying:', err)
		document.body.style.display = 'block'
	}
}

// Автоматический вызов для страницы
redirectIfPlaying()
