import { createCatalogApi } from "../server/catalog-api.mjs";

const api = createCatalogApi();

export default {
  fetch(request) {
    return api(request);
  },
};
