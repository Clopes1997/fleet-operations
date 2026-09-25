import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"./retirement",workers:1,timeout:90000,use:{baseURL:process.env.FLEET_REHEARSAL_URL,ignoreHTTPSErrors:true,channel:process.env.CI?undefined:"chrome",screenshot:"off",trace:"off",video:"off"}});
