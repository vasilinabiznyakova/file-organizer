# file-organizer

CLI-застосунок на Node.js для аналізу й упорядкування файлів. Він рекурсивно
сканує директорії, знаходить дублікати за SHA-256, копіює файли до тематичних
категорій та видаляє застарілі файли.

## Вимоги

- Node.js 20.1 або новіший (для `fs.readdir({ recursive: true })`)

Зовнішні npm-пакети не потрібні.

## Використання

```bash
node file-organizer.js scan ./Downloads
node file-organizer.js duplicates ./Downloads
node file-organizer.js organize ./Downloads
node file-organizer.js organize ./Downloads --output ./Sorted
node file-organizer.js cleanup ./Downloads --older-than 90
node file-organizer.js cleanup ./Downloads --older-than 90 --confirm
```

`organize` лише копіює файли, залишаючи оригінали без змін. За замовчуванням
результат створюється у `<directory>/Organized`. Якщо вихідна директорія вже
містить файл з таким ім’ям, до копії додається числовий суфікс.

`cleanup` за замовчуванням працює в безпечному dry-run режимі: показує список файлів, розмір кожного та підсумок. Файли видаляються лише з прапорцем `--confirm`.
Порожні директорії після очищення не видаляються.

## Події

Кожна команда реалізована окремим класом на основі `EventEmitter`:

- `Scanner`: `file-found`, `file-error`, `scan-complete`;
- `DuplicateFinder`: `hash-calculated`, `file-error`, `search-complete`;
- `Organizer`: `file-copied`, `file-error`, `organize-complete`;
- `Cleaner`: `file-matched` або `file-removed`, `file-error`, `cleanup-complete`.

SHA-256 завжди обчислюється потоком. Під час організації файли розміром від
10 MB копіюються через streams; для менших файлів використовується `copyFile`.

## Тести

```bash
npm test
```
