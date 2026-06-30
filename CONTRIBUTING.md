# Contributing

## Ветки

- `main` — стабильная. Прямой push запрещён, только через PR.
- Рабочие ветки: `feat/<кратко>`, `fix/<кратко>`, `chore/<кратко>`.

## Коммиты — Conventional Commits (на русском)

```
<тип>(<область>): <краткое описание в повелительном наклонении>
```

Типы: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.

Примеры:

```
feat(clients): добавь карточку клиента с привязкой ТС
fix(sync): дели топливо на 10 (Omnicomm отдаёт децилитры)
docs(readme): опиши интеграцию с Omnicomm API
```

## Перед PR

- `npm run lint` и `npm run build` проходят.
- Секреты не в коммите (проверь `git diff --staged`).
- PR заполнен по шаблону.
