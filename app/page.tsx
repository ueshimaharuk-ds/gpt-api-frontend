"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const startVoice = async () => {
    try {
      setStatus("connecting...");
      addLog("🔑 Azure セッション取得中...");

      // 1. バックエンドからエフェメラルキーを取得
      const tokenRes = await fetch(
        "https://gpt-api-backend-eneaaeh0h0cxgxf6.japanwest-01.azurewebsites.net/realtime/session",
        { method: "POST" }
      );

      const tokenData = await tokenRes.json();
      
      if (!tokenData.client_secret?.value) {
        throw new Error(`トークン取得失敗: ${JSON.stringify(tokenData)}`);
      }

      const EPHEMERAL_KEY = tokenData.client_secret.value;
      addLog("✅ エフェメラルキー取得成功");

      // 2. WebRTC接続準備
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const audio = document.createElement("audio");
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
      };

      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = (e) => addLog("🤖 " + e.data);

      // 3. Offer作成
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 4. Azure OpenAI の WebRTC エンドポイントへ送信
      const AZURE_REALTIME_URL = `https://gpt-api-realtime.openai.azure.com/openai/deployments/gpt-realtime-1.5/realtime?api-version=2024-10-01-preview`;

      const response = await fetch(AZURE_REALTIME_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`WebRTC接続失敗: ${errText}`);
      }

      const answerSDP = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });

      setStatus("connected");
      addLog("🎤 Azure Realtime AI 接続完了");
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      addLog(`❌ エラー: ${err.message}`);
    }
  };

  const stopVoice = () => {
    addLog("🛑 停止処理");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    pcRef.current?.close();
    setStatus("stopped");
  };

  const handleToggle = async () => {
    if (isRunning) {
      stopVoice();
      setIsRunning(false);
    } else {
      await startVoice();
      setIsRunning(true);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-lg p-8 bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl">
        <h1 className="text-2xl font-bold mb-6 text-center">Azure Realtime Voice</h1>
        <div className="flex justify-center mb-8">
          <button
            onClick={handleToggle}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
              isRunning ? "bg-red-500 animate-pulse" : "bg-blue-600 hover:scale-105"
            }`}
          >
            {isRunning ? "Stop" : "Start"}
          </button>
        </div>
        <div className="h-48 overflow-y-auto text-sm space-y-1 text-gray-400 font-mono">
          {logs.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      </div>
    </div>
  );
}