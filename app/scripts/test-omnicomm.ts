/** Smoke-тест клиента Omnicomm на демо-контуре (только чтение, без мутаций). */
import { OmnicommClient } from "../lib/omnicomm/client";

const base = process.env.OMNICOMM_API_URL || "https://online.omnicomm.ru";
const login = process.env.OMNICOMM_LOGIN || "rudemoru";
const password = process.env.OMNICOMM_PASSWORD || "rudemo123456";

async function main() {
  const c = new OmnicommClient(base, login, password);

  const health = await c.healthProbe();
  console.log("health:", health);
  if (!health.ok) process.exit(1);

  const vehicles = await c.listVehicles();
  console.log(`vehicles: ${vehicles.length}`);
  for (const v of vehicles.slice(0, 5)) {
    console.log(
      ` uuid=${v.uuid.slice(0,8)} tid=${v.terminalId} name="${v.name}" terminal=${v.terminalType ?? "?"} group="${v.groupName ?? ""}"`
    );
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
