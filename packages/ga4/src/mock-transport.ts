import type { Ga4Transport, Ga4TransportRequest, Ga4TransportResponse } from "./types";

export class MockGa4Transport implements Ga4Transport {
  readonly requests: Ga4TransportRequest[] = [];
  private readonly responses: Array<Ga4TransportResponse | Error> = [];

  enqueue(response: Ga4TransportResponse | Error): void {
    this.responses.push(response);
  }

  async request(input: Ga4TransportRequest): Promise<Ga4TransportResponse> {
    this.requests.push(input);
    const response = this.responses.shift();
    if (!response) throw new Error("mock_transport_response_missing");
    if (response instanceof Error) throw response;
    return response;
  }
}

export function mockJson(status: number, value: unknown, headers: Record<string, string> = {}): Ga4TransportResponse {
  return { status, headers: new Headers({ "content-type": "application/json", ...headers }), body: JSON.stringify(value) };
}
