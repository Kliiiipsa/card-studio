"use client";
import localforage from "localforage";

/**
 * IndexedDB-backed stores for the MVP. No backend required. Replaceable later
 * with a Supabase/Postgres repository implementing the same repo interfaces.
 */

let configured = false;

function ensure() {
  if (configured) return;
  localforage.config({
    name: "wb-card-studio",
    storeName: "wb_card_studio",
    description: "Projects and generations for Kartogen",
  });
  configured = true;
}

export const projectsTable = (() => {
  ensure();
  return localforage.createInstance({ name: "wb-card-studio", storeName: "projects" });
})();

export const generationsTable = (() => {
  ensure();
  return localforage.createInstance({ name: "wb-card-studio", storeName: "generations" });
})();

export const templatesTable = (() => {
  ensure();
  return localforage.createInstance({ name: "wb-card-studio", storeName: "templates" });
})();

export const analysisTable = (() => {
  ensure();
  return localforage.createInstance({ name: "wb-card-studio", storeName: "analysis" });
})();
