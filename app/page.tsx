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
      addLog("🔑 バックエンドにセッションを要求中...");

      // 1. バックエンドからエフェメラルキーを取得
      const tokenRes = await fetch(
        "https://gpt-api-backend-eneaaeh0h0cxgxf6.japanwest-01.azurewebsites.net/realtime/session",
        { method: "POST" }
      );

      const tokenData = await tokenRes.json();
      
      // エフェメラルキーの存在確認
      if (!tokenData.client_secret?.value) {
        throw new Error("エフェメラルキーを取得できませんでした。バックエンドのログを確認してください。");
      }

      const EPHEMERAL_KEY = tokenData.client_secret.value;
      addLog("✅ エフェメラルキー取得完了");

      // 2. WebRTC接続の準備
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // マイク入力の取得
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 音声トラックを接続に追加
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // AIからの音声出力を再生
      pc.ontrack = (event) => {
        const audio = document.createElement("audio");
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
      };

      // データチャネル（テキストイベント用）
      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = (e) => addLog("🤖 " + e.data);

      // 3. WebRTC Offerを作成
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 4. Azure OpenAI の WebRTC エンドポイントへ Offer を送信
      // ※ URLはご自身のエンドポイントに合わせてください
      const AZURE_REALTIME_URL = `https://gpt-api-realtime.openai.azure.com/openai/deployments/gpt-realtime-1.5/realtime?api-version=2024-10-01-preview`;

      const response = await fetch(AZURE_REALTIME_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`, // ここでエフェメラルキーを使用
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure WebRTC Error: ${errorText}`);
      }

      const answerSDP = await response.text();

      // 5. Answer を設定して接続完了
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSDP,
      });

      setStatus("connected");
      addLog("🎤 Azure Realtime AI と接続されました");
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      addLog(`❌ エラー: ${err.message}`);
    }
  };

  const stopVoice = () => {
    addLog("🛑 通話を終了します");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl p-8 bg-white/5 backdrop-blur rounded-2xl shadow-2xl border border-white/10">
        <h1 className="text-3xl font-bold mb-6 text-center tracking-tight">
          🎤 Azure Realtime AI
        </h1>

        <div className="mb-6 text-center">
          <span className={`px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-widest ${
            status === "connected" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
          }`}>
            {status}
          </span>
        </div>

        <div className="flex justify-center mb-8">
          <button
            onClick={handleToggle}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-2xl transition-all active:scale-95 ${
              isRunning 
                ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
            }`}
          >
            {isRunning ? "⏹ 通話を停止" : "🎙 会話を開始"}
          </button>
        </div>

        <div className="h-64 overflow-y-auto bg-black/50 p-4 rounded-xl border border-white/5 text-sm font-mono space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="opacity-80 border-b border-white/5 pb-1 last:border-0">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}