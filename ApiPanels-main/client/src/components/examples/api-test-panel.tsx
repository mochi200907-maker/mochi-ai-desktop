import { APITestPanel } from "../api-test-panel";
import { API_ENDPOINTS } from "@shared/api-schema";

export default function APITestPanelExample() {
  return (
    <div className="p-6">
      <APITestPanel endpoint={API_ENDPOINTS[0]} />
    </div>
  );
}
