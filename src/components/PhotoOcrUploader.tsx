import React, { useState, useRef } from "react";
import { Upload, FileImage, Sparkles, Loader2, ArrowRight, Check, AlertCircle, RefreshCw } from "lucide-react";

interface ExtractedWord {
  word: string;
  translation?: string;
  selected?: boolean;
}

interface PhotoOcrUploaderProps {
  onImportWords: (words: { word: string; translation?: string }[]) => void;
  onClose: () => void;
}

export default function PhotoOcrUploader({ onImportWords, onClose }: PhotoOcrUploaderProps) {
  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("image/jpeg");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedWords, setExtractedWords] = useState<ExtractedWord[]>([]);
  const [ocrSuccess, setOcrSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image selection details
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择合法的图片文件（PNG, JPG, WEBP 等）");
      return;
    }
    const currentMimeType = file.type;
    setMimeType(currentMimeType);
    setError(null);
    setLoading(true);

    const reader = new FileReader();
    reader.onloadend = () => {
      const resultDataUrl = reader.result as string;
      setImage(resultDataUrl);
      // Automatically trigger extraction on reading complete
      autoExtract(resultDataUrl, currentMimeType);
    };
    reader.onerror = () => {
      setError("图片读取失败，请重试。");
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const clearImage = () => {
    setImage(null);
    setExtractedWords([]);
    setOcrSuccess(false);
    setError(null);
  };

  // Automated Word Miner calling our secure REST endpoint
  const autoExtract = async (imageDataUrl: string, currentMime: string) => {
    setLoading(true);
    setError(null);

    try {
      // Remove dataurl prefix e.g., "data:image/png;base64,"
      const base64Data = imageDataUrl.split(",")[1];
      
      const response = await fetch("/api/extract-words-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          mimeType: currentMime,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "OCR Extraction Failed");
      }

      const words: ExtractedWord[] = (result.words || []).map((w: any) => ({
        word: w.word.trim(),
        translation: w.translation ? w.translation.trim() : "",
        selected: true,
      }));

      if (words.length === 0) {
        throw new Error("照片中未识别出清晰的英文单词。请确认照片内包含清晰可辨的英文，且光线充足。");
      }

      setExtractedWords(words);
      setOcrSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "请求服务器识别失败，请检查网路连接或重新上传图片。");
    } finally {
      setLoading(false);
    }
  };

  // Fallback manual trigger (or retry)
  const handleOcrExtraction = async () => {
    if (!image) return;
    await autoExtract(image, mimeType);
  };

  const toggleSelectWord = (index: number) => {
    const updated = [...extractedWords];
    updated[index].selected = !updated[index].selected;
    setExtractedWords(updated);
  };

  const handleWordFieldChange = (index: number, field: "word" | "translation", val: string) => {
    const updated = [...extractedWords];
    if (field === "word") {
      updated[index].word = val;
    } else {
      updated[index].translation = val;
    }
    setExtractedWords(updated);
  };

  const handleAddWordToRow = () => {
    setExtractedWords([...extractedWords, { word: "", translation: "", selected: true }]);
  };

  const handleImportSelected = () => {
    const active = extractedWords.filter(w => w.selected && w.word.trim().length > 0);
    if (active.length === 0) {
      setError("Please select at least one word to import.");
      return;
    }
    onImportWords(active.map(w => ({ word: w.word.trim(), translation: w.translation?.trim() })));
    onClose();
  };

  return (
    <div id="photo-ocr-container" className="fixed inset-0 bg-neutral-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div id="photo-ocr-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-semibold text-neutral-800 text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
              通过照片智能提取单词
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              上传含英文的书页、手写单词本、试卷照片，AI 自动帮您提取整理成电子词单
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 font-sans text-xl px-2 py-1 rounded-lg"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6">
          {/* Left panel: File Uploader or Image Preview */}
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-xl bg-neutral-50 min-h-[300px] max-h-[500px] overflow-hidden p-4 relative">
            {!image ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer w-full h-full flex flex-col items-center justify-center p-6 text-center hover:bg-neutral-100/50 transition duration-200"
              >
                <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4 text-indigo-600">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-neutral-800 mb-1">
                  拖拽照片或点击上传
                </h4>
                <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
                  支持 JPG, PNG, WEBP 格式图片。请尽量保证照片光线充足、字迹清晰。
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col relative">
                <div className="flex-1 flex items-center justify-center bg-neutral-900 rounded-lg overflow-hidden relative">
                  <img
                    src={image}
                    alt="Uploaded user notes"
                    className="max-hc-full object-contain max-h-[340px]"
                    referrerPolicy="no-referrer"
                  />
                  
                  {loading && (
                    <div className="absolute inset-0 bg-neutral-900/70 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                      <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
                      <span className="text-sm font-semibold tracking-wide">Gemini 正在识别照片文字...</span>
                      <span className="text-[10px] text-neutral-400 mt-1">自动过滤符号 提取出核心英文词汇</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center mt-3 gap-2">
                  <button
                    onClick={clearImage}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    重新上传
                  </button>

                  {!ocrSuccess && (
                    <button
                      onClick={handleOcrExtraction}
                      disabled={loading}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg shadow-sm flex items-center gap-1 transition"
                    >
                      {loading ? "正在智能提取..." : "重新发起识别"} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Extracted Words Grid and List */}
          <div className="w-full lg:w-[420px] border border-neutral-100 rounded-xl p-4 flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-3">
              <h4 className="font-semibold text-sm text-neutral-800 flex items-center gap-1.5">
                <FileImage className="w-4 h-4 text-indigo-500" />
                提取到的英文单词
                {extractedWords.length > 0 && (
                  <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {extractedWords.filter(w => w.selected).length}/{extractedWords.length}
                  </span>
                )}
              </h4>
              {ocrSuccess && (
                <button
                  onClick={handleAddWordToRow}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + 手动补录
                </button>
              )}
            </div>

            {/* Error notifications */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg flex gap-1.5 items-start mb-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{error}</span>
              </div>
            )}

            {/* List entries */}
            <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-none space-y-2 pr-1">
              {extractedWords.length === 0 ? (
                <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                  <Sparkles className="w-8 h-8 text-neutral-300 mb-2" />
                  <p className="text-xs">尚无提取数据</p>
                  <p className="text-[10px] text-neutral-300 mt-1">请在左侧上传并启动“智能提取”</p>
                </div>
              ) : (
                extractedWords.map((item, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition ${
                      item.selected ? "border-indigo-100 bg-indigo-50/20" : "border-neutral-100 bg-neutral-50/40 opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!item.selected}
                      onChange={() => toggleSelectWord(index)}
                      className="w-4 h-4 text-indigo-600 border-neutral-300 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1 flex gap-1 items-center min-w-0">
                      <input
                        type="text"
                        value={item.word}
                        onChange={(e) => handleWordFieldChange(index, "word", e.target.value)}
                        placeholder="英文单词"
                        className="w-1/2 p-1 text-xs border border-neutral-200 rounded text-neutral-800 font-semibold focus:outline-none focus:border-indigo-400"
                      />
                      <input
                        type="text"
                        value={item.translation}
                        onChange={(e) => handleWordFieldChange(index, "translation", e.target.value)}
                        placeholder="含义（选填）"
                        className="w-1/2 p-1 text-xs border border-neutral-200 rounded text-neutral-600 focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {ocrSuccess && (
              <div className="pt-3 border-t border-neutral-100 mt-3 flex gap-2">
                <button
                  onClick={handleImportSelected}
                  className="flex-1 py-2 font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition rounded-lg shadow-md flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> 确认导入已有名单
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer info warning */}
        <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-[11px] text-neutral-400">
          <span>💡 提示：导入至词库后，可以一键触发<b>“智能补充”</b>生成音标与例句。</span>
          <span className="text-indigo-600/80 font-semibold">Gemini API 支持</span>
        </div>
      </div>
    </div>
  );
}
