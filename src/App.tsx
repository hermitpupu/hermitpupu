/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  ClipboardCheck, 
  ClipboardCopy, 
  FileText, 
  Sparkles, 
  RotateCcw, 
  AlertCircle,
  BrainCircuit,
  History,
  CheckCircle2,
  Loader2,
  FileDown,
  Mic,
  MicOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SYSTEM_INSTRUCTION = `你是一名【心理治疗记录书写助手】，任务是将输入的 session 内容整理为结构化、专业、中性、可供审阅的治疗记录草稿。

严格禁止：
1. 进行诊断或诊断暗示
2. 给出自杀 / 自伤风险的等级判断或结论
3. 使用病理化、推断性或评价性语言
4. 生成可被直接视为最终正式病历的文本

允许的范围：
1. 仅描述来访者在会谈中表达或呈现的状态
2. 若涉及症状或风险，只能记录“被提及 / 被讨论 / 治疗中关注到”，不得判断严重程度或变化趋势
3. 所有内容均为治疗记录草稿，需由专业人员审核

写作原则：
1. 第三人称
2. 描述性、克制、中性
3. 使用“当前观察”“会谈中提及”“初步理解”等表述
4. 信息不足时保持空缺或笼统描述，不补充推断

输出结构（必须严格遵守，不得新增或删减标题）：

治疗内容

• 观察与评估：
主诉： 描述患者在本次会谈中呈现或表达的精神状态（情绪、认知、行为等），仅限观察与自述内容
症状相关内容： 记录患者在会谈中提及或讨论到的焦虑、抑郁、压力体验，或对自杀 / 自伤相关内容的提及情况（仅作描述，不作评估或判断）

• 干预措施：
描述本次会谈中使用的治疗技术或介入方式（如情绪澄清、认知重述、探索性提问、正念练习等）
记录是否布置家庭作业或给予建议，仅描述内容，不评估完成情况或效果

• 进展与反馈：
描述患者对会谈与干预的即时反应（如参与度、情绪变化、理解或困惑的表达）
若涉及治疗目标，仅描述当前会谈中的相关讨论或方向，不做达成度判断

• 下一步计划：
简要记录下次会谈的初步关注方向或计划中的调整`;

export default function App() {
  const [sessionInput, setSessionInput] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [result, setResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const handleGenerate = async () => {
    if (!sessionInput.trim()) {
      setError('请输入会谈简述内容');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const prompt = `以下是 session 输入，请据此生成治疗记录草稿：

【会谈简述】
${sessionInput}

【关键词 / 关键句（如有）】
${keywordsInput || '无'}`;

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        },
      });

      const text = response.text;
      if (text) {
        setResult(text);
        // Scroll to result after a short delay to allow rendering
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else {
        throw new Error('未能生成内容，请重试');
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || '生成过程中出现错误，请检查网络或稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportWord = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const lines = result.split('\n');
      const children: any[] = [];

      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          children.push(new Paragraph({ spacing: { before: 200 } }));
          return;
        }

        // Simple markdown-ish parsing for Word
        if (trimmedLine.startsWith('# ')) {
          children.push(new Paragraph({
            text: trimmedLine.replace('# ', ''),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }));
        } else if (trimmedLine.startsWith('## ')) {
          children.push(new Paragraph({
            text: trimmedLine.replace('## ', ''),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 }
          }));
        } else if (trimmedLine.startsWith('### ') || trimmedLine === '治疗内容') {
          children.push(new Paragraph({
            text: trimmedLine.replace('### ', ''),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 }
          }));
        } else {
          // Handle bold text and bullet points
          const isBullet = trimmedLine.startsWith('•') || trimmedLine.startsWith('*') || trimmedLine.startsWith('-');
          const content = isBullet ? trimmedLine.substring(1).trim() : trimmedLine;
          
          const parts = content.split(/(\*\*.*?\*\*)/);
          const textRuns = parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return new TextRun({
                text: part.slice(2, -2),
                bold: true,
              });
            }
            return new TextRun(part);
          });

          children.push(new Paragraph({
            children: textRuns,
            bullet: isBullet ? { level: 0 } : undefined,
            spacing: { after: 120 }
          }));
        }
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `治疗记录草稿_${new Date().toLocaleDateString()}.docx`);
    } catch (err) {
      console.error('Export error:', err);
      setError('导出Word文档失败');
    } finally {
      setExporting(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('您的浏览器不支持语音识别功能。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        setSessionInput(prev => prev + transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setError('请允许麦克风访问权限以使用语音输入。');
      } else {
        setError('语音输入出错，请重试。');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const handleReset = () => {
    setSessionInput('');
    setKeywordsInput('');
    setResult('');
    setError(null);
    if (isListening) {
      recognitionRef.current?.stop();
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <BrainCircuit className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">PsyNote Assistant</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">心理治疗记录书写助手</p>
            </div>
          </div>
          <button 
            onClick={handleReset}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            title="重置"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Input Section */}
        <section className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="space-y-2 relative">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <FileText size={16} className="text-emerald-600" />
                  会谈简述 / 速记
                </label>
                <div className="relative">
                  <textarea
                    value={sessionInput}
                    onChange={(e) => setSessionInput(e.target.value)}
                    placeholder="在此粘贴 session 自由记录、速记或对话摘要..."
                    className="w-full h-48 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none text-sm leading-relaxed"
                  />
                  <button
                    onClick={toggleListening}
                    className={cn(
                      "absolute bottom-4 right-4 p-3 rounded-full transition-all shadow-sm",
                      isListening 
                        ? "bg-red-500 text-white animate-pulse" 
                        : "bg-white text-emerald-600 border border-gray-200 hover:bg-gray-50"
                    )}
                    title={isListening ? "停止录音" : "语音输入"}
                  >
                    {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <History size={16} className="text-emerald-600" />
                  关键词 / 关键句 (可选)
                </label>
                <input
                  type="text"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder="例如：焦虑、工作压力、童年回忆..."
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <AlertCircle size={14} />
                <span>生成内容仅供草稿参考，需专业人员审核</span>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !sessionInput.trim()}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md",
                  isGenerating || !sessionInput.trim()
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] shadow-emerald-200"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    正在整理...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    生成记录草稿
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm"
            >
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Section */}
        <AnimatePresence>
          {result && (
            <motion.section
              ref={resultRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between px-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-600" size={20} />
                  治疗记录草稿
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportWord}
                    disabled={exporting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {exporting ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <FileDown size={16} />
                    )}
                    导出Word
                  </button>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      copied 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    {copied ? (
                      <>
                        <ClipboardCheck size={16} />
                        已复制
                      </>
                    ) : (
                      <>
                        <ClipboardCopy size={16} />
                        复制全文
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 prose prose-emerald max-w-none">
                <div className="markdown-body">
                  <Markdown>{result}</Markdown>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-emerald-800 leading-relaxed">
                <p className="font-semibold mb-1">⚠️ 提示：</p>
                <p>本助手仅根据您提供的信息进行结构化整理。请务必核对事实准确性，并根据专业判断进行修改。严禁直接将此草稿作为最终诊断依据或法律文书。</p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-12 text-center text-gray-400 text-xs border-t border-gray-100 mt-12">
        <p>© {new Date().getFullYear()} PsyNote Assistant · 专业心理治疗辅助工具</p>
        <p className="mt-1">基于 Gemini AI 技术构建</p>
      </footer>
    </div>
  );
}
