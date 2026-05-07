"use strict";

// ---------- Localization scaffolding ----------
// A tiny translation helper. Translators register a language pack via
// window.I18n.registerLang("es", { ... }). UI code calls window.t("key", "fallback")
// and gets the translated string, falling back to the fallback then the key.
//
// This is intentionally minimal — enough to make the app translatable without
// rewriting any of the existing English copy. The default English pack uses
// the existing strings as fallbacks, so the UI works with no translations
// loaded at all.

const PACKS = {
  en: {
    // Header / nav
    "nav.home": "Home",
    "nav.skipToMain": "Skip to main content",
    "nav.appNavigation": "App navigation",
    "nav.toggleSound": "Toggle sound",
    "nav.openSettings": "Open settings",
    "nav.yourProgress": "Your progress",
    // Welcome
    "welcome.tagline": "Face fears, one rung at a time.",
    "welcome.eyebrow": "Gradual exposure · 3D · voice-guided",
    "welcome.begin": "Begin",
    "welcome.howItWorks": "How a session works",
    "welcome.firstMakeYourself": "First, make yourself.",
    "welcome.createCharacter": "Create your character",
    // Pillars
    "pillar.stayInControl": "You stay in control",
    "pillar.stayInControl.desc": "Pause, breathe, or leave any rung. Nothing locks. Nothing surprises you.",
    "pillar.habituation": "Habituation is real",
    "pillar.habituation.desc": "Anxiety naturally falls when you stay with it. Each rung asks you to hold a little longer.",
    "pillar.newLearning": "New learning, not erasure",
    "pillar.newLearning.desc": "Exposure builds a stronger \"safe\" memory on top of the old fear — the science is called inhibitory learning.",
    // Buttons
    "btn.start": "Start",
    "btn.locked": "Locked",
    "btn.continue": "I'm ready — continue",
    "btn.pauseBreathe": "Pause & breathe",
    "btn.back": "Back",
    "btn.save": "Save",
    "btn.cancel": "Cancel",
    "btn.export": "Export",
    "btn.import": "Import",
    "btn.delete": "Delete",
    "btn.edit": "Edit",
    "btn.reset": "Reset",
    "btn.shareCard": "Share progress card",
    // Menu
    "menu.continueLadder": "▶ Continue your ladder",
    "menu.allFears": "✦ All fears",
    "menu.yourProgress": "📊 Your progress",
    "menu.customLadder": "＋ Build a custom ladder",
    "menu.editCharacter": "✎ Edit character",
    "menu.switchCharacter": "⇄ Switch character",
    "menu.settings": "⚙ Settings",
    "menu.footer": "Step Up · prototype, not therapy.",
  },

  es: {
    "nav.home": "Inicio",
    "nav.skipToMain": "Saltar al contenido",
    "nav.appNavigation": "Navegación",
    "nav.toggleSound": "Activar / silenciar sonido",
    "nav.openSettings": "Abrir ajustes",
    "nav.yourProgress": "Tu progreso",
    "welcome.tagline": "Enfrenta tus miedos, peldaño a peldaño.",
    "welcome.eyebrow": "Exposición gradual · 3D · guiada por voz",
    "welcome.begin": "Comenzar",
    "welcome.howItWorks": "Cómo funciona una sesión",
    "welcome.firstMakeYourself": "Primero, crea tu personaje.",
    "welcome.createCharacter": "Crear personaje",
    "pillar.stayInControl": "Tú tienes el control",
    "pillar.stayInControl.desc": "Pausa, respira o sal de cualquier peldaño. Nada se bloquea. Nada te sorprende.",
    "pillar.habituation": "La habituación es real",
    "pillar.habituation.desc": "La ansiedad baja cuando te quedas con ella. Cada peldaño te pide aguantar un poco más.",
    "pillar.newLearning": "Aprender de nuevo, no borrar",
    "pillar.newLearning.desc": "La exposición construye un recuerdo \"seguro\" sobre el viejo miedo — la ciencia lo llama aprendizaje inhibitorio.",
    "btn.start": "Comenzar",
    "btn.locked": "Bloqueado",
    "btn.continue": "Listo — continuar",
    "btn.pauseBreathe": "Pausa y respira",
    "btn.back": "Atrás",
    "btn.save": "Guardar",
    "btn.cancel": "Cancelar",
    "btn.export": "Exportar",
    "btn.import": "Importar",
    "btn.delete": "Eliminar",
    "btn.edit": "Editar",
    "btn.reset": "Reiniciar",
    "btn.shareCard": "Compartir tarjeta",
    "menu.continueLadder": "▶ Continuar tu escalera",
    "menu.allFears": "✦ Todos los miedos",
    "menu.yourProgress": "📊 Tu progreso",
    "menu.customLadder": "＋ Crear escalera personalizada",
    "menu.editCharacter": "✎ Editar personaje",
    "menu.switchCharacter": "⇄ Cambiar personaje",
    "menu.settings": "⚙ Ajustes",
    "menu.footer": "Step Up · prototipo, no terapia.",
  },

  fr: {
    "nav.home": "Accueil",
    "nav.skipToMain": "Aller au contenu",
    "nav.appNavigation": "Navigation",
    "nav.toggleSound": "Activer / désactiver le son",
    "nav.openSettings": "Ouvrir les réglages",
    "nav.yourProgress": "Vos progrès",
    "welcome.tagline": "Face à vos peurs, un barreau à la fois.",
    "welcome.eyebrow": "Exposition graduée · 3D · guidée par la voix",
    "welcome.begin": "Commencer",
    "welcome.howItWorks": "Comment se passe une session",
    "welcome.firstMakeYourself": "D'abord, créez votre personnage.",
    "welcome.createCharacter": "Créer votre personnage",
    "pillar.stayInControl": "Vous gardez le contrôle",
    "pillar.stayInControl.desc": "Faites une pause, respirez, partez d'un barreau à tout moment. Rien ne se verrouille.",
    "pillar.habituation": "L'habituation est réelle",
    "pillar.habituation.desc": "L'anxiété diminue naturellement quand vous restez avec. Chaque barreau vous demande de tenir un peu plus.",
    "pillar.newLearning": "Apprentissage neuf, pas effacement",
    "pillar.newLearning.desc": "L'exposition construit un souvenir \"sûr\" par-dessus l'ancienne peur — la science l'appelle apprentissage inhibiteur.",
    "btn.start": "Commencer",
    "btn.locked": "Verrouillé",
    "btn.continue": "Prêt — continuer",
    "btn.pauseBreathe": "Pause et respirez",
    "btn.back": "Retour",
    "btn.save": "Enregistrer",
    "btn.cancel": "Annuler",
    "btn.export": "Exporter",
    "btn.import": "Importer",
    "btn.delete": "Supprimer",
    "btn.edit": "Modifier",
    "btn.reset": "Réinitialiser",
    "btn.shareCard": "Partager la carte",
    "menu.continueLadder": "▶ Continuer votre échelle",
    "menu.allFears": "✦ Toutes les peurs",
    "menu.yourProgress": "📊 Vos progrès",
    "menu.customLadder": "＋ Créer une échelle personnalisée",
    "menu.editCharacter": "✎ Modifier le personnage",
    "menu.switchCharacter": "⇄ Changer de personnage",
    "menu.settings": "⚙ Réglages",
    "menu.footer": "Step Up · prototype, pas une thérapie.",
  },
};

let currentLang = "en";
try {
  const saved = localStorage.getItem("fobia.lang");
  if (saved && PACKS[saved]) currentLang = saved;
} catch {}

function t(key, fallback) {
  const pack = PACKS[currentLang];
  if (pack && pack[key] != null) return pack[key];
  // Fall back to English, then to the developer-provided fallback, then the key
  if (PACKS.en && PACKS.en[key] != null) return PACKS.en[key];
  return fallback != null ? fallback : key;
}
function setLang(lang) {
  if (PACKS[lang]) {
    currentLang = lang;
    try { localStorage.setItem("fobia.lang", lang); } catch {}
    try { window.dispatchEvent(new CustomEvent("lang-changed", { detail: { lang } })); } catch {}
  }
}
function registerLang(lang, pack) {
  PACKS[lang] = Object.assign({}, PACKS[lang] || {}, pack);
}
function availableLangs() { return Object.keys(PACKS); }
function currentLanguage() { return currentLang; }

window.I18n = { t, setLang, registerLang, availableLangs, currentLanguage };
window.t = t;
