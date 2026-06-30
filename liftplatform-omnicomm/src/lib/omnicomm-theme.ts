// Omnicomm — фирменные токены интерфейса (раздел 21 ТЗ).
// Использовать в Tailwind-классах или CSS-переменных глобального layout.
export const OMNICOMM = {
  navy: '#1f3864',
  navyDark: '#16294a',
  blue: '#2e75b6',
  blueLight: '#5b9bd5',
  // цветовая индикация статусов (раздел 21)
  status: {
    done: '#16a34a',      // зелёный — выполнено
    overdue: '#dc2626',   // красный — просрочка
    waiting: '#d97706',   // жёлтый/оранжевый — ожидание
    inProgress: '#2e75b6' // синий — в работе
  },
} as const;
