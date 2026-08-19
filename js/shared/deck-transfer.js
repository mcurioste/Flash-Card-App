(() => {
const SCHEMA_VERSION = 1;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CARDS = 5000;
const CARD_FIELDS = ['id', 'word', 'reading', 'type', 'meaning', 'example', 'translation'];
const DECK_FIELDS = ['id', 'title', 'description', 'language', 'level', 'prompt', 'maxCards', 'cards'];
const ROOT_FIELDS = ['schemaVersion', 'exportedAt', 'deck'];
const CSV_FIELDS = [
  'schemaVersion', 'exportedAt', 'deckId', 'title', 'description', 'language', 'level', 'prompt',
  'maxCards', 'cardId', 'word', 'reading', 'type', 'meaning', 'example', 'translation'
];
const ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,127}$/u;
const MIME_TYPES = {
  json: new Set(['', 'application/json', 'text/json', 'text/plain']),
  csv: new Set(['', 'text/csv', 'application/csv', 'text/plain'])
};

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xDC00 || next > 0xDFFF) return true;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

function requiredString(value, label, maxLength, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) {
    fail(`${label} must be ${allowEmpty ? `at most ${maxLength}` : `between 1 and ${maxLength}`} characters.`);
  }
  if (hasLoneSurrogate(value)) fail(`${label} must contain valid Unicode text.`);
  return value;
}

function validId(value, label) {
  requiredString(value, label, 128);
  if (!ID_PATTERN.test(value)) fail(`${label} contains unsupported characters.`);
  return value;
}

function validateTransfer(value) {
  if (!hasExactKeys(value, ROOT_FIELDS)) {
    fail('The JSON must contain exactly schemaVersion, exportedAt, and deck.');
  }
  if (value.schemaVersion !== SCHEMA_VERSION) fail(`Unsupported schema version. Expected ${SCHEMA_VERSION}.`);
  if (
    typeof value.exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.exportedAt) ||
    !Number.isFinite(Date.parse(value.exportedAt))
  ) {
    fail('exportedAt must be a valid ISO 8601 UTC timestamp.');
  }
  if (!hasExactKeys(value.deck, DECK_FIELDS)) fail(`deck must contain exactly: ${DECK_FIELDS.join(', ')}.`);
  const deck = value.deck;
  validId(deck.id, 'deck.id');
  requiredString(deck.title, 'deck.title', 80);
  requiredString(deck.description, 'deck.description', 240, true);
  requiredString(deck.language, 'deck.language', 60);
  requiredString(deck.level, 'deck.level', 60);
  requiredString(deck.prompt, 'deck.prompt', 160);
  if (
    deck.maxCards !== null &&
    (!Number.isSafeInteger(deck.maxCards) || deck.maxCards < 1 || deck.maxCards > MAX_CARDS)
  ) {
    fail(`deck.maxCards must be null or an integer from 1 to ${MAX_CARDS}.`);
  }
  if (!Array.isArray(deck.cards) || deck.cards.length > MAX_CARDS) {
    fail(`deck.cards must be an array with no more than ${MAX_CARDS} cards.`);
  }
  if (deck.maxCards !== null && deck.cards.length > deck.maxCards) fail('deck.cards exceeds deck.maxCards.');
  const ids = new Set();
  deck.cards.forEach((card, index) => {
    const path = `deck.cards[${index}]`;
    if (!hasExactKeys(card, CARD_FIELDS)) fail(`${path} must contain exactly: ${CARD_FIELDS.join(', ')}.`);
    validId(card.id, `${path}.id`);
    if (ids.has(card.id)) fail(`${path}.id is duplicated.`);
    ids.add(card.id);
    CARD_FIELDS.slice(1).forEach((field) => requiredString(card[field], `${path}.${field}`, 1000));
  });
  return JSON.parse(JSON.stringify(value));
}

function createTransfer(deck) {
  if (!Array.isArray(deck?.cards)) fail('deck.cards must be an array.');
  if (deck.cards.length > MAX_CARDS) fail(`A deck cannot contain more than ${MAX_CARDS} cards.`);
  const transfer = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    deck: {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      language: deck.language,
      level: deck.level,
      prompt: deck.prompt,
      maxCards: deck.maxCards ?? null,
      cards: deck.cards.map((card) => Object.fromEntries(CARD_FIELDS.map((field) => [field, card[field]])))
    }
  };
  const validated = validateTransfer(transfer);
  assertTransferSize(validated);
  return validated;
}

const FORMULA_RISK = /^(?:['\uFEFF]|\p{White_Space}|\p{Cc})*[=+\-@]/u;

function protectSpreadsheetCell(value) {
  const text = String(value);
  return FORMULA_RISK.test(text) ? `'${text}` : text;
}

function restoreSpreadsheetCell(value) {
  return value.startsWith("'") && FORMULA_RISK.test(value.slice(1)) ? value.slice(1) : value;
}

function csvCell(value) {
  return `"${protectSpreadsheetCell(value).replaceAll('"', '""')}"`;
}

function toCsv(transfer) {
  const { deck } = transfer;
  const base = [
    transfer.schemaVersion,
    transfer.exportedAt,
    deck.id,
    deck.title,
    deck.description,
    deck.language,
    deck.level,
    deck.prompt,
    deck.maxCards ?? ''
  ];
  const cards = deck.cards.length ? deck.cards : [null];
  return [
    CSV_FIELDS.map(csvCell).join(','),
    ...cards.map((card) => [
      ...base,
      ...(card ? CARD_FIELDS.map((field) => card[field]) : Array(CARD_FIELDS.length).fill(''))
    ].map(csvCell).join(','))
  ].join('\r\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let state = 'unquoted';

  const pushCell = () => {
    row.push(restoreSpreadsheetCell(cell));
    cell = '';
    state = 'unquoted';
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    if (rows.length > MAX_CARDS + 2) fail('The CSV contains too many rows.');
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (state === 'quoted') {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        state = 'afterQuote';
      } else {
        cell += char;
      }
    } else if (state === 'afterQuote') {
      if (char === ',') {
        pushCell();
      } else if (char === '\n') {
        pushRow();
      } else if (char === '\r' && text[index + 1] === '\n') {
        pushRow();
        index += 1;
      } else {
        fail('The CSV contains characters after a closing quote.');
      }
    } else if (char === '"') {
      if (cell !== '') fail('The CSV contains a quote inside an unquoted field.');
      state = 'quoted';
    } else if (char === ',') {
      pushCell();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      if (text[index + 1] !== '\n') fail('The CSV must use LF or CRLF line endings.');
      pushRow();
      index += 1;
    } else {
      cell += char;
    }
  }

  if (state === 'quoted') fail('The CSV has an unterminated quoted value.');
  if (state === 'afterQuote' || cell || row.length) {
    pushCell();
    rows.push(row);
  }
  return rows;
}

function serializeTransfer(transfer, format) {
  return format === 'json' ? `${JSON.stringify(transfer, null, 2)}\n` : toCsv(transfer);
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function assertTransferSize(transfer) {
  for (const format of ['json', 'csv']) {
    if (byteLength(serializeTransfer(transfer, format)) > MAX_FILE_BYTES) {
      fail(`This deck is too large. Its ${format.toUpperCase()} export must not exceed 2 MB.`);
    }
  }
}

function csvToTransfer(text) {
  const rows = parseCsv(text);
  if (
    rows.length < 2 ||
    rows[0].length !== CSV_FIELDS.length ||
    !CSV_FIELDS.every((field, index) => rows[0][index] === field)
  ) {
    fail('The CSV header does not match the Recall export schema.');
  }
  if (rows.slice(1).some((row) => row.length !== CSV_FIELDS.length)) {
    fail('Every CSV row must have exactly 16 columns.');
  }
  const records = rows.slice(1).map((row) => Object.fromEntries(CSV_FIELDS.map((field, index) => [field, row[index]])));
  const first = records[0];
  const metadataFields = CSV_FIELDS.slice(0, 9);
  if (records.some((record) => metadataFields.some((field) => record[field] !== first[field]))) {
    fail('Deck metadata must be identical on every CSV row.');
  }
  const emptyCard = CARD_FIELDS.every((field) => first[field === 'id' ? 'cardId' : field] === '');
  if (emptyCard && records.length !== 1) fail('Only an empty deck may contain a blank card row.');
  const cards = emptyCard ? [] : records.map((record, index) => {
    const mapped = {
      id: record.cardId,
      ...Object.fromEntries(CARD_FIELDS.slice(1).map((field) => [field, record[field]]))
    };
    if (Object.values(mapped).some((value) => value === '')) fail(`CSV card row ${index + 2} is incomplete.`);
    return mapped;
  });
  const maxCards = first.maxCards === '' ? null : Number(first.maxCards);
  return validateTransfer({
    schemaVersion: Number(first.schemaVersion),
    exportedAt: first.exportedAt,
    deck: {
      id: first.deckId,
      title: first.title,
      description: first.description,
      language: first.language,
      level: first.level,
      prompt: first.prompt,
      maxCards,
      cards
    }
  });
}

async function readImportFile(file) {
  if (!(file instanceof File)) fail('Choose a file to import.');
  if (file.size === 0) fail('The selected file is empty.');
  if (file.size > MAX_FILE_BYTES) fail('The selected file is larger than 2 MB.');
  const extension = file.name.toLocaleLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const mime = file.type.toLocaleLowerCase().split(';', 1)[0].trim();
  if (!MIME_TYPES[extension]?.has(mime)) fail('Choose a Recall JSON or CSV file with a matching file type.');
  const text = (await file.text()).replace(/^\uFEFF/, '');
  if (extension === 'csv') return csvToTransfer(text);
  try {
    return validateTransfer(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) fail('The JSON is malformed.');
    throw error;
  }
}

function safeFilename(title) {
  return title
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80) || 'recall-deck';
}

async function exportDeck(deck, format) {
  if (format !== 'json' && format !== 'csv') fail('Choose JSON or CSV.');
  const transfer = createTransfer(deck);
  const json = format === 'json';
  const mime = json ? 'application/json' : 'text/csv';
  const blob = new Blob([serializeTransfer(transfer, format)], { type: json ? mime : `${mime};charset=utf-8` });
  const name = `${safeFilename(deck.title)}.recall.${format}`;
  const file = new File([blob], name, { type: blob.type });
  const mobile = matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `Export ${deck.title}` });
    return 'shared';
  }
  if ('showSaveFilePicker' in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: json ? 'Recall JSON deck' : 'Recall CSV deck', accept: { [mime]: [`.${format}`] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'saved';
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

window.RecallDeckTransfer = {
  SCHEMA_VERSION,
  MAX_FILE_BYTES,
  MAX_CARDS,
  createTransfer,
  validateTransfer,
  readImportFile,
  exportDeck
};
})();
