import React, { useState, useMemo, useEffect } from 'react';
import { 
  Lock, RefreshCw, Plus, Trash2, Calendar, Clock, 
  FileText, Settings, BarChart3, Copy,
  Sparkles, Key, Search, Image as ImageIcon,
  PenSquare, CloudUpload, ExternalLink, ListPlus, EyeOff, FileDown, Layers, ChevronUp, ChevronDown, FileType, Repeat, CheckCircle, Save, Link as LinkIcon, Users, UserPlus, Download
} from 'lucide-react';
import { Question, ExamConfig, StudentSubmission, ExamSection, StudentAccount } from '../types';
import { generateQuizQuestions, extractQuestionsFromInput, generateSimilarQuestions } from '../services/geminiService';
import { parseStudentAccountsFromCSV } from '../utils/csvParser';
import MathRenderer from './MathRenderer';
import * as docx from 'docx';

interface AdminPanelProps {
  reviewQuestions: Question[];
  examQuestions: Question[];
  createdExams: ExamConfig[];
  submissions: StudentSubmission[];
  studentAccounts: StudentAccount[]; // NEW
  onDataUpdate: (questions: Question[]) => void;
  onCreateExam: (exam: ExamConfig) => void;
  onDeleteExam: (id: string) => void;
  onClearExams: () => void;
  onClearSubmissions: () => void;
  onAddStudent: (student: StudentAccount) => void; // NEW
  onDeleteStudent: (id: string) => void; // NEW
  onImportStudents: (students: StudentAccount[]) => void; // NEW
  reviewSheetLink: string;
  examSheetLink: string;
}

type AdminTab = 'config' | 'results' | 'ai-gen' | 'students';
type AIGenMode = 'topic' | 'file';

// --- UTILS ---
function shuffleArrayForExport<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Calculate Similarity Logic
const calculateSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const set1 = new Set(s1);
    const set2 = new Set(s2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
};

// Selection Logic to avoid duplicates
const selectDiverseQuestions = (pool: Question[], count: number): Question[] => {
    const shuffled = shuffleArrayForExport(pool);
    const selected: Question[] = [];
    
    for (const q of shuffled) {
       if (selected.length >= count) break;
       const isTooSimilar = selected.some(sel => calculateSimilarity(sel.cauHoi, q.cauHoi) > 0.7);
       if (!isTooSimilar) selected.push(q);
    }
    if (selected.length < count) {
        const remaining = shuffled.filter(q => !selected.includes(q));
        selected.push(...remaining.slice(0, count - selected.length));
    }
    return selected;
}

// Helper to normalize strings
const normalizeStr = (s: string | undefined) => s?.trim().toLowerCase().normalize('NFC') || '';
const isMatch = (a: string | undefined, b: string | undefined) => normalizeStr(a) === normalizeStr(b);

// Helper to convert Google Drive links
const getDisplayImageUrl = (url?: string) => {
  if (!url || !url.trim()) return undefined;
  const cleanUrl = url.trim();
  if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com')) {
    const idMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/) || cleanUrl.match(/id=([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=s1200`;
    }
  }
  return cleanUrl;
};

// Image handler for Word
const getImageDataForDocx = async (url: string): Promise<{ data: ArrayBuffer, width: number, height: number } | null> => {
  if (!url) return null;
  try {
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png&w=800&q=80`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("Fetch failed");
    const blob = await response.blob();
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous"; 
      img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0);
            
            // Resize logic
            const maxWidth = 450; 
            const maxHeight = 500;
            let w = img.naturalWidth || 200;
            let h = img.naturalHeight || 200;
            if (w > maxWidth) { const r = maxWidth/w; w=maxWidth; h=h*r; }
            if (h > maxHeight) { const r = maxHeight/h; h=maxHeight; w=w*r; }

            canvas.toBlob(async (pngBlob) => {
                if (!pngBlob) { resolve(null); return; }
                const pngBuffer = await pngBlob.arrayBuffer();
                resolve({ data: pngBuffer, width: Math.round(w), height: Math.round(h) });
            }, 'image/png');
        } catch (err) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });
  } catch (e) { return null; }
};

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  reviewQuestions,
  examQuestions,
  createdExams,
  submissions,
  studentAccounts,
  onDataUpdate, 
  onCreateExam, 
  onDeleteExam, 
  onClearExams,
  onClearSubmissions,
  onAddStudent,
  onDeleteStudent,
  onImportStudents
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('config');

  const [resultSearch, setResultSearch] = useState('');

  // Student Management State
  const [newStudentId, setNewStudentId] = useState('');
  const [newStudentPass, setNewStudentPass] = useState('123');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentClass, setNewStudentClass] = useState('');
  const [importCsvText, setImportCsvText] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const [aiMode, setAiMode] = useState<AIGenMode>('topic');
  const [aiConfig, setAiConfig] = useState({
    apiKey: '', topic: '', lesson: '', grade: '9', count: 5, difficulty: 'Biết', additionalPrompt: ''
  });
  const [showAiContext, setShowAiContext] = useState(false);
  const [aiContextText, setAiContextText] = useState('');
  const [aiContextImage, setAiContextImage] = useState<string | null>(null);
  const [aiContextMime, setAiContextMime] = useState('');
  const [aiContextFileName, setAiContextFileName] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Question | null>(null);
  
  const [similarCount, setSimilarCount] = useState(5);
  const [isGeneratingSimilar, setIsGeneratingSimilar] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);

  const [uploadText, setUploadText] = useState('');
  const [uploadImage, setUploadImage] = useState<string | null>(null);
  const [uploadMimeType, setUploadMimeType] = useState<string>('');

  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDate, setNewExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [newExamDuration, setNewExamDuration] = useState(45);
  const [newExamVariants, setNewExamVariants] = useState(1);
  const [newExamShuffleQ, setNewExamShuffleQ] = useState(true);
  const [newExamShuffleA, setNewExamShuffleA] = useState(true);
  const [newExamReview, setNewExamReview] = useState(true);
  const [newExamHideTakenVariants, setNewExamHideTakenVariants] = useState(false);

  const [examSections, setExamSections] = useState<ExamSection[]>([]);
  
  const [selClass, setSelClass] = useState('All');
  const [selTopic, setSelTopic] = useState('');
  const [selLesson, setSelLesson] = useState('');
  const [cntBiet, setCntBiet] = useState(0);
  const [cntHieu, setCntHieu] = useState(0);
  const [cntVanDung, setCntVanDung] = useState(0);

  const totalExamQuestions = useMemo(() => {
    return examSections.reduce((acc, sec) => acc + sec.countBiet + sec.countHieu + sec.countVanDung, 0);
  }, [examSections]);

  const examAvailableClasses = useMemo(() => Array.from(new Set(examQuestions.map(q => q.lop).filter(Boolean))).sort(), [examQuestions]);
  
  const examAvailableTopics = useMemo(() => {
    let q = examQuestions;
    if (selClass && selClass !== 'All') {
      q = q.filter(item => item.lop === selClass);
    }
    return Array.from(new Set(q.map(item => item.chuDe).filter(Boolean))).sort();
  }, [examQuestions, selClass]);

  const examAvailableLessons = useMemo(() => {
    let q = examQuestions;
    if (selClass && selClass !== 'All') q = q.filter(item => item.lop === selClass);
    if (selTopic) q = q.filter(item => item.chuDe === selTopic);
    return Array.from(new Set(q.map(item => item.bai).filter(Boolean))).sort();
  }, [examQuestions, selClass, selTopic]);

  const availableCounts = useMemo(() => {
     let pool = examQuestions;
     if (selClass && selClass !== 'All') pool = pool.filter(q => q.lop === selClass);
     if (selTopic) pool = pool.filter(q => q.chuDe === selTopic);
     if (selLesson) pool = pool.filter(q => q.bai === selLesson);

     const countLevel = (keyword: string) => 
        pool.filter(q => q.mucDo && q.mucDo.toLowerCase().includes(keyword)).length;

     return {
        biet: countLevel('biết'),
        hieu: countLevel('hiểu'),
        vandung: countLevel('vận dụng')
     };
  }, [examQuestions, selClass, selTopic, selLesson]);

  const filteredSubmissions = useMemo(() => {
     if (!resultSearch) return submissions;
     const term = resultSearch.toLowerCase();
     return submissions.filter(s => 
        s.studentName.toLowerCase().includes(term) ||
        s.className.toLowerCase().includes(term) ||
        s.examTitle.toLowerCase().includes(term)
     );
  }, [submissions, resultSearch]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch) return studentAccounts;
    const term = studentSearch.toLowerCase();
    return studentAccounts.filter(s => 
      s.id.toLowerCase().includes(term) ||
      s.name.toLowerCase().includes(term) ||
      s.className.toLowerCase().includes(term)
    );
  }, [studentAccounts, studentSearch]);

  const overallAvg = useMemo(() => {
    if (submissions.length === 0) return "0.0";
    const totalScore = submissions.reduce((sum, s) => sum + s.score, 0);
    return (totalScore / submissions.length).toFixed(1);
  }, [submissions]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'AdminBinhgoal2025@' || password === 'AdminBinhgoal25@') {
      setIsLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Mật khẩu không đúng');
    }
  };

  const handleAddStudentClick = () => {
    if (!newStudentId || !newStudentPass || !newStudentName) {
      alert("Vui lòng điền ID, Tên và Mật khẩu!");
      return;
    }
    onAddStudent({
      id: newStudentId,
      password: newStudentPass,
      name: newStudentName,
      className: newStudentClass
    });
    setNewStudentId('');
    setNewStudentName('');
    setNewStudentClass('');
    setNewStudentPass('123'); // Reset to default
  };

  const handleBulkImportStudents = () => {
    if (!importCsvText) return;
    const students = parseStudentAccountsFromCSV(importCsvText);
    if (students.length > 0) {
      onImportStudents(students);
      setImportCsvText('');
      alert(`Đã tìm thấy ${students.length} tài khoản.`);
    } else {
      alert("Không tìm thấy dữ liệu hợp lệ. Hãy kiểm tra định dạng CSV.");
    }
  };

  const handleAddSection = () => {
     if (!selTopic) {
        alert("Vui lòng chọn ít nhất một chủ đề!");
        return;
     }
     const totalCount = cntBiet + cntHieu + cntVanDung;
     if (totalCount <= 0) {
        alert("Vui lòng nhập số lượng câu hỏi > 0");
        return;
     }

     if (cntBiet > availableCounts.biet || cntHieu > availableCounts.hieu || cntVanDung > availableCounts.vandung) {
        if (!confirm(`Cảnh báo: Số lượng câu hỏi bạn chọn lớn hơn số lượng có sẵn trong kho.\n- Biết: ${availableCounts.biet}\n- Hiểu: ${availableCounts.hieu}\n- Vận dụng: ${availableCounts.vandung}\nBạn có muốn tiếp tục không?`)) {
            return;
        }
     }

     const newSection: ExamSection = {
        id: `sec-${Date.now()}`,
        targetClass: selClass,
        selectedTopic: selTopic,
        selectedLesson: selLesson,
        countBiet: cntBiet,
        countHieu: cntHieu,
        countVanDung: cntVanDung
     };

     setExamSections([...examSections, newSection]);
     setCntBiet(0);
     setCntHieu(0);
     setCntVanDung(0);
  };

  const handleRemoveSection = (id: string) => {
     setExamSections(examSections.filter(s => s.id !== id));
  };

  const handleCreateExamClick = async () => {
    if (!newExamTitle) {
       alert("Vui lòng nhập tên kỳ thi!");
       return;
    }
    if (examSections.length === 0) {
       alert("Vui lòng thêm ít nhất một phần vào cấu trúc đề thi!");
       return;
    }

    // --- SELECT ACTUAL QUESTIONS NOW ---
    let selectedQuestions: Question[] = [];
    
    examSections.forEach(sec => {
       let pool = examQuestions;
       if (sec.targetClass && sec.targetClass !== 'All') pool = pool.filter(q => isMatch(q.lop, sec.targetClass));
       if (sec.selectedTopic) pool = pool.filter(q => isMatch(q.chuDe, sec.selectedTopic));
       if (sec.selectedLesson) pool = pool.filter(q => isMatch(q.bai, sec.selectedLesson));

       const filterByLevel = (p: Question[], levelKeyword: string) => 
          p.filter(q => q.mucDo && q.mucDo.toLowerCase().includes(levelKeyword.toLowerCase()));

       const poolBiet = filterByLevel(pool, 'biết');
       const poolHieu = filterByLevel(pool, 'hiểu');
       const poolVanDung = filterByLevel(pool, 'vận dụng');

       const qBiet = selectDiverseQuestions(poolBiet, sec.countBiet);
       const qHieu = selectDiverseQuestions(poolHieu, sec.countHieu);
       const qVanDung = selectDiverseQuestions(poolVanDung, sec.countVanDung);
       
       selectedQuestions = [...selectedQuestions, ...qBiet, ...qHieu, ...qVanDung];
    });

    if (selectedQuestions.length === 0) {
        alert("Lỗi: Không tìm thấy câu hỏi phù hợp trong kho! Vui lòng kiểm tra lại cấu hình.");
        return;
    }

    const examId = `exam-${Date.now()}`;
    const exam: ExamConfig = {
      id: examId,
      title: newExamTitle,
      date: newExamDate,
      duration: newExamDuration,
      sections: examSections,
      specificQuestions: selectedQuestions,
      questionCount: selectedQuestions.length,
      targetClass: 'Mixed',
      shuffleQuestions: newExamShuffleQ,
      shuffleAnswers: newExamShuffleA,
      allowDuplicates: false,
      allowReview: newExamReview,
      variants: newExamVariants,
      hideTakenVariants: newExamHideTakenVariants,
      createdAt: Date.now()
    };

    onCreateExam(exam);
    alert(`Đã tạo bài thi thành công! (${selectedQuestions.length} câu)`);
    setNewExamTitle('');
    setExamSections([]);
    setNewExamHideTakenVariants(false);
  };

  const handleDeleteExamClick = (id: string) => {
      if (!confirm("Bạn có chắc muốn xóa bài thi này không?")) return;
      onDeleteExam(id);
  };

  const handleExportWord = async (exam: ExamConfig) => {
    setIsExportingWord(true);
    try {
      let selectedQuestions: Question[] = [];

      if (exam.specificQuestions && exam.specificQuestions.length > 0) {
          selectedQuestions = [...exam.specificQuestions];
      } 
      else {
        alert("Đề thi này không có dữ liệu câu hỏi.");
        setIsExportingWord(false);
        return;
      }

      const docChildren: any[] = [];
      docChildren.push(
         new docx.Paragraph({
            text: exam.title,
            heading: docx.HeadingLevel.TITLE,
            alignment: docx.AlignmentType.CENTER,
         }),
         new docx.Paragraph({
            text: `Môn: Toán - Thời gian: ${exam.duration} phút`,
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 400 },
         })
      );

      for (const [index, q] of selectedQuestions.entries()) {
         docChildren.push(
            new docx.Paragraph({
               children: [
                  new docx.TextRun({ text: `Câu ${index + 1}: `, bold: true }),
                  new docx.TextRun({ text: q.cauHoi })
               ],
               spacing: { before: 200, after: 100 }
            })
         );

         const imageUrl = getDisplayImageUrl(q.linkAnh);
         if (imageUrl) {
            const imgData = await getImageDataForDocx(imageUrl);
            
            if (imgData) {
               docChildren.push(
                  new docx.Paragraph({
                     children: [
                        new docx.ImageRun({
                           data: imgData.data,
                           transformation: { width: imgData.width, height: imgData.height },
                           type: "png"
                        }),
                     ],
                     alignment: docx.AlignmentType.CENTER,
                     spacing: { after: 200 }
                  })
               );
            } else {
               docChildren.push(
                   new docx.Paragraph({
                       children: [new docx.TextRun({text: `(Xem hình tại link online)`, italics: true, color: "0000FF"})], 
                       spacing: { after: 100 }
                   }),
                   new docx.Paragraph({
                       children: [new docx.TextRun({text: imageUrl, size: 16, color: "0000FF", underline: { type: docx.UnderlineType.SINGLE }})],
                       spacing: { after: 100 }
                   })
               );
            }
         }

         const opts = [`A. ${q.dapAnA}`, `B. ${q.dapAnB}`, `C. ${q.dapAnC}`, `D. ${q.dapAnD}`];
         docChildren.push(
            new docx.Paragraph({
               children: [new docx.TextRun({ text: opts[0] + "      " }), new docx.TextRun({ text: opts[1] })],
               spacing: { after: 50 }
            }),
            new docx.Paragraph({
               children: [new docx.TextRun({ text: opts[2] + "      " }), new docx.TextRun({ text: opts[3] })],
               spacing: { after: 200 }
            })
         );
      }

      docChildren.push(
         new docx.Paragraph({
             text: "ĐÁP ÁN & LỜI GIẢI CHI TIẾT",
             heading: docx.HeadingLevel.HEADING_1,
             pageBreakBefore: true,
             alignment: docx.AlignmentType.CENTER,
             spacing: { after: 300 }
         })
      );
      const answersText = selectedQuestions.map((q, i) => `${i+1}.${q.dapAnDung}`).join('   |   ');
      docChildren.push(
         new docx.Paragraph({
            children: [new docx.TextRun({ text: "BẢNG ĐÁP ÁN NHANH:", bold: true })]
         }),
         new docx.Paragraph({
            text: answersText,
            spacing: { after: 400 }
         })
      );

      for (const [index, q] of selectedQuestions.entries()) {
         docChildren.push(
             new docx.Paragraph({
                 children: [
                     new docx.TextRun({ text: `Câu ${index + 1}: `, bold: true }),
                     new docx.TextRun({ text: `Đáp án ${q.dapAnDung}. ` }),
                 ]
             }),
             new docx.Paragraph({
                 children: [new docx.TextRun({ text: q.loiGiai || "(Chưa có lời giải chi tiết)" })],
                 spacing: { after: 200 }
             })
         );
      }

      const doc = new docx.Document({ sections: [{ properties: {}, children: docChildren }] });
      const blob = await docx.Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exam.title.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
       console.error(error);
       alert("Lỗi khi tạo file Word: " + error.message);
    } finally {
       setIsExportingWord(false);
    }
  };

  const handleCopyToExcel = () => { 
    const content = submissions.map(s => `${s.studentName}\t${s.score}`).join('\n');
    navigator.clipboard.writeText(content);
    alert("Đã copy");
  };
  
  const handleCopyAIToExcel = () => { 
     const content = generatedQuestions.map(q => 
       `${q.lop}\t${q.chuDe}\t${q.bai}\t${q.mucDo || 'Hiểu'}\t${q.cauHoi}\t${q.linkAnh||''}\t${q.dapAnA}\t${q.dapAnB}\t${q.dapAnC}\t${q.dapAnD}\t${q.dapAnDung}\t${q.goiY}\t${q.loiGiai}`
     ).join('\n');
     navigator.clipboard.writeText(content);
     alert("Đã copy (13 cột chuẩn)");
  };

  const handleGenerateAI = async () => {
    if (!aiConfig.apiKey) return alert("Vui lòng nhập API Key!");
    if (!aiConfig.topic) return alert("Nhập chủ đề!");
    setIsGenerating(true);
    setGeneratedQuestions([]);
    try {
      let sourceData = undefined;
      if (aiContextText || aiContextImage) {
         sourceData = {
            text: aiContextText,
            imageBase64: aiContextImage || undefined,
            mimeType: aiContextMime
         };
      }

      const rawQuestions = await generateQuizQuestions(
        aiConfig.topic, 
        aiConfig.lesson, 
        aiConfig.grade, 
        aiConfig.count, 
        aiConfig.difficulty, 
        aiConfig.apiKey,
        aiConfig.additionalPrompt,
        sourceData
      );
      setGeneratedQuestions(rawQuestions.map((q, i) => ({
        id: `ai-${Date.now()}-${i}`,
        lop: aiConfig.grade, chuDe: aiConfig.topic, bai: q.bai || "AI",
        cauHoi: q.cauHoi||"", dapAnA: q.dapAnA||"", dapAnB: q.dapAnB||"", dapAnC: q.dapAnC||"", dapAnD: q.dapAnD||"",
        dapAnDung: (q.dapAnDung as any)||'A', goiY: q.goiY||"", loiGiai: q.loiGiai||"", linkAnh: q.linkAnh||"",
        mucDo: q.mucDo || aiConfig.difficulty
      })));
    } catch (e: any) { alert(e.message); }
    setIsGenerating(false);
  };
  
  const handleGenerateSimilar = async () => {
    if (!aiConfig.apiKey) return alert("Vui lòng nhập API Key!");
    if (generatedQuestions.length === 0) return alert("Cần có câu hỏi mẫu để tạo tương tự!");
    setIsGeneratingSimilar(true);
    try {
       const similarQs = await generateSimilarQuestions(generatedQuestions, similarCount, aiConfig.apiKey);
       const mappedSimilar = similarQs.map((q, i) => ({
        id: `sim-${Date.now()}-${i}`,
        lop: q.lop || generatedQuestions[0].lop, 
        chuDe: q.chuDe || generatedQuestions[0].chuDe, 
        bai: q.bai || generatedQuestions[0].bai,
        cauHoi: q.cauHoi||"", dapAnA: q.dapAnA||"", dapAnB: q.dapAnB||"", dapAnC: q.dapAnC||"", dapAnD: q.dapAnD||"",
        dapAnDung: (q.dapAnDung as any)||'A', goiY: q.goiY||"", loiGiai: q.loiGiai||"", linkAnh: q.linkAnh||"",
        mucDo: q.mucDo || generatedQuestions[0].mucDo
      }));
      setGeneratedQuestions(prev => [...prev, ...mappedSimilar]);
    } catch (e: any) {
       alert(e.message);
    }
    setIsGeneratingSimilar(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
           const base64String = reader.result as string;
           setUploadImage(base64String.split(',')[1]); 
           setUploadMimeType(file.type);
        };
        reader.readAsDataURL(file);
      } else {
        alert("Chỉ hỗ trợ file ảnh (JPG, PNG)");
      }
    }
  };

  const handleContextFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0];
     if (file) {
       if (file.type.startsWith('image/') || file.type === 'application/pdf') {
         const reader = new FileReader();
         reader.onloadend = () => {
            const base64String = reader.result as string;
            setAiContextImage(base64String.split(',')[1]); 
            setAiContextMime(file.type);
            setAiContextFileName(file.name);
         };
         reader.readAsDataURL(file);
       } else {
         alert("Chỉ hỗ trợ file Ảnh (PNG/JPG) hoặc PDF.");
       }
     }
  };

  const handleExtractFromInput = async () => {
    if (!aiConfig.apiKey) return alert("Vui lòng nhập API Key!");
    if (!uploadText && !uploadImage) return alert("Vui lòng dán nội dung hoặc tải ảnh lên!");
    
    setIsGenerating(true);
    setGeneratedQuestions([]);
    
    try {
      const extracted = await extractQuestionsFromInput({
        text: uploadText,
        imageBase64: uploadImage || undefined,
        mimeType: uploadMimeType
      }, aiConfig.apiKey);

      setGeneratedQuestions(extracted.map((q, i) => ({
        id: `ext-${Date.now()}-${i}`,
        lop: q.lop || "12",
        chuDe: q.chuDe || "Chưa phân loại",
        bai: q.bai || "Tổng hợp",
        cauHoi: q.cauHoi || "",
        dapAnA: q.dapAnA || "", dapAnB: q.dapAnB || "", dapAnC: q.dapAnC || "", dapAnD: q.dapAnD || "",
        dapAnDung: (q.dapAnDung?.toString().trim().toUpperCase().charAt(0) as any) || 'A',
        goiY: q.goiY || "",
        loiGiai: q.loiGiai || "",
        linkAnh: q.linkAnh || "",
        mucDo: q.mucDo || "Hiểu"
      })));

    } catch(e: any) {
      alert(e.message);
    }
    setIsGenerating(false);
  };

  const handleSaveAIQuestions = () => {
    onDataUpdate([...reviewQuestions, ...generatedQuestions]);
    setGeneratedQuestions([]);
    alert("Đã lưu vào kho câu hỏi!");
  };

  const startEditQuestion = (q: Question, i: number) => { setEditingIndex(i); setEditForm({...q}); };
  const cancelEdit = () => { setEditingIndex(null); setEditForm(null); };
  const saveEditQuestion = () => {
     if(editingIndex!==null && editForm) {
        const list = [...generatedQuestions]; list[editingIndex] = editForm;
        setGeneratedQuestions(list); cancelEdit();
     }
  };

  const handleLinkAnhChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     if (!editForm) return;
     let val = e.target.value;
     if (val.includes('drive.google.com') || val.includes('docs.google.com')) {
         const idMatch = val.match(/\/d\/([a-zA-Z0-9-_]+)/) || val.match(/id=([a-zA-Z0-9-_]+)/);
         if (idMatch && idMatch[1]) {
             val = `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=s1200`;
         }
     }
     setEditForm({...editForm, linkAnh: val});
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-100 p-4 rounded-full"><Lock className="w-8 h-8 text-indigo-600" /></div>
          </div>
          <h2 className="text-xl font-bold text-center text-slate-800 mb-6">Học toán cùng T.Bình</h2>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-lg mb-4" placeholder="Mật khẩu..." />
          {loginError && <p className="text-red-500 text-sm mb-4">{loginError}</p>}
          <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg">Đăng nhập</button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" /> Học toán cùng T.Bình - Quản trị
          </h2>
          <p className="text-sm text-slate-500 mt-1">
             Kho ôn tập: <span className="font-bold text-indigo-600">{reviewQuestions.length}</span> | Kho đề thi: <span className="font-bold text-indigo-600">{examQuestions.length}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
           <span className="text-xs text-slate-400">Dữ liệu được lưu trong Local Storage</span>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        <button onClick={() => setActiveTab('config')} className={`px-6 py-3 font-medium text-sm rounded-t-lg flex gap-2 ${activeTab === 'config' ? 'bg-white border-t border-x text-blue-600' : 'bg-slate-50 text-slate-500'}`}><ListPlus className="w-4 h-4"/> Cấu Hình Thi</button>
        <button onClick={() => setActiveTab('students')} className={`px-6 py-3 font-medium text-sm rounded-t-lg flex gap-2 ${activeTab === 'students' ? 'bg-white border-t border-x text-green-600' : 'bg-slate-50 text-slate-500'}`}><Users className="w-4 h-4"/> Quản Lý Học Sinh</button>
        <button onClick={() => setActiveTab('ai-gen')} className={`px-6 py-3 font-medium text-sm rounded-t-lg flex gap-2 ${activeTab === 'ai-gen' ? 'bg-white border-t border-x text-violet-600' : 'bg-slate-50 text-slate-500'}`}><Sparkles className="w-4 h-4"/> AI Tạo Câu Hỏi</button>
        <button onClick={() => setActiveTab('results')} className={`px-6 py-3 font-medium text-sm rounded-t-lg flex gap-2 ${activeTab === 'results' ? 'bg-white border-t border-x text-indigo-600' : 'bg-slate-50 text-slate-500'}`}><BarChart3 className="w-4 h-4"/> Kết Quả Thi</button>
      </div>

      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-left-4 duration-300">
           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
              <h3 className="font-bold text-lg text-slate-800 mb-5 flex items-center gap-2">
                 <Plus className="w-5 h-5 text-indigo-600" /> Tạo Đề Thi Mới
              </h3>
              
              <div className="space-y-4">
                 <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase">1. Thông tin chung</h4>
                    <div>
                       <label className="text-sm font-medium text-slate-700">Tên kỳ thi</label>
                       <input type="text" className="w-full px-3 py-2 border rounded-lg" placeholder="VD: Kiểm tra 1 tiết Đại số" value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <div>
                          <label className="text-sm font-medium text-slate-700">Ngày thi</label>
                          <input type="date" className="w-full px-3 py-2 border rounded-lg" value={newExamDate} onChange={e => setNewExamDate(e.target.value)} />
                       </div>
                       <div>
                          <label className="text-sm font-medium text-slate-700">Thời gian (phút)</label>
                          <input type="number" className="w-full px-3 py-2 border rounded-lg" value={newExamDuration} onChange={e => setNewExamDuration(Number(e.target.value))} />
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="text-sm font-medium text-slate-700">Số lượng mã đề</label>
                          <input type="number" min="1" max="10" className="w-full px-3 py-2 border rounded-lg" value={newExamVariants} onChange={e => setNewExamVariants(Number(e.target.value))} />
                        </div>
                    </div>
                    <div className="flex gap-4 pt-1 flex-wrap">
                       <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={newExamShuffleQ} onChange={e => setNewExamShuffleQ(e.target.checked)}/> Đảo câu hỏi</label>
                       <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={newExamShuffleA} onChange={e => setNewExamShuffleA(e.target.checked)}/> Đảo đáp án</label>
                    </div>
                    <div className="pt-1">
                        <label className="flex gap-2 items-center text-xs text-indigo-700 font-medium cursor-pointer">
                            <input type="checkbox" checked={newExamHideTakenVariants} onChange={e => setNewExamHideTakenVariants(e.target.checked)} className="accent-indigo-600"/> 
                            <EyeOff className="w-3 h-3"/> Ẩn mã đề khi đã chọn (Mỗi máy chỉ làm 1 đề)
                        </label>
                    </div>
                 </div>

                 <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-3">
                    <h4 className="text-xs font-bold text-indigo-700 uppercase flex justify-between">
                       <span>2. Cấu trúc đề thi</span>
                       {totalExamQuestions > 0 && <span className="bg-indigo-600 text-white px-2 rounded-full">{totalExamQuestions} câu</span>}
                    </h4>
                    
                    <div className="grid grid-cols-3 gap-2">
                        <select className="px-2 py-2 border rounded text-sm" value={selClass} onChange={e => {setSelClass(e.target.value); setSelTopic(''); setSelLesson('');}}>
                           <option value="All">Tất cả lớp</option>
                           {examAvailableClasses.map(c => <option key={c} value={c}>Lớp {c}</option>)}
                        </select>
                        <select className="col-span-2 px-2 py-2 border rounded text-sm" value={selTopic} onChange={e => {setSelTopic(e.target.value); setSelLesson('');}}>
                           <option value="">-- Chọn Chủ đề --</option>
                           {examAvailableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <select className="w-full px-2 py-2 border rounded text-sm" value={selLesson} onChange={e => setSelLesson(e.target.value)} disabled={!selTopic}>
                       <option value="">-- Chọn Bài học (Tùy chọn) --</option>
                       {examAvailableLessons.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>

                    <div className="grid grid-cols-3 gap-2">
                       <div>
                          <label className="text-xs text-slate-500 block mb-1">Biết ({availableCounts.biet})</label>
                          <input type="number" min="0" max={availableCounts.biet} className="w-full p-2 border rounded" value={cntBiet} onChange={e => setCntBiet(Number(e.target.value))} />
                       </div>
                       <div>
                          <label className="text-xs text-slate-500 block mb-1">Hiểu ({availableCounts.hieu})</label>
                          <input type="number" min="0" max={availableCounts.hieu} className="w-full p-2 border rounded" value={cntHieu} onChange={e => setCntHieu(Number(e.target.value))} />
                       </div>
                       <div>
                          <label className="text-xs text-slate-500 block mb-1">Vận dụng ({availableCounts.vandung})</label>
                          <input type="number" min="0" max={availableCounts.vandung} className="w-full p-2 border rounded" value={cntVanDung} onChange={e => setCntVanDung(Number(e.target.value))} />
                       </div>
                    </div>
                    
                    <button onClick={handleAddSection} className="w-full py-2 bg-indigo-100 text-indigo-700 font-bold rounded-lg hover:bg-indigo-200 transition-colors flex items-center justify-center gap-2">
                       <ListPlus className="w-4 h-4" /> Thêm vào cấu trúc
                    </button>

                    {/* Section List Preview */}
                    <div className="space-y-2 mt-4">
                       {examSections.map((sec, idx) => (
                          <div key={sec.id} className="p-3 bg-white border border-slate-200 rounded-lg flex justify-between items-center text-sm shadow-sm">
                             <div>
                                <span className="font-bold text-slate-700">Phần {idx + 1}:</span> {sec.selectedTopic} 
                                <span className="text-slate-400 mx-2">|</span> 
                                <span className="text-xs bg-green-100 text-green-700 px-1 rounded">B: {sec.countBiet}</span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded ml-1">H: {sec.countHieu}</span>
                                <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded ml-1">VD: {sec.countVanDung}</span>
                             </div>
                             <button onClick={() => handleRemoveSection(sec.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                          </div>
                       ))}
                    </div>
                 </div>
                 
                 <button onClick={handleCreateExamClick} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 mt-4">
                    <CheckCircle className="w-5 h-5" /> Hoàn Tất Tạo Đề Thi
                 </button>
              </div>
           </div>

           {/* Exam List */}
           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
              <div className="flex justify-between items-center mb-5">
                 <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-slate-500" /> Danh Sách Đề Thi</h3>
                 {createdExams.length > 0 && <button onClick={onClearExams} className="text-xs text-red-500 hover:text-red-700 underline">Xóa tất cả</button>}
              </div>

              {createdExams.length === 0 ? (
                 <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">Chưa có đề thi nào được tạo.</div>
              ) : (
                 <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {createdExams.map(exam => {
                       const isToday = new Date(exam.date).toDateString() === new Date().toDateString();
                       const isPast = new Date(exam.date) < new Date(new Date().toDateString());
                       
                       return (
                          <div key={exam.id} className="group p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all bg-white relative">
                             <div className="flex justify-between items-start mb-2">
                                <div>
                                   <h4 className="font-bold text-slate-800">{exam.title}</h4>
                                   <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isToday ? 'bg-green-100 text-green-700' : isPast ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>
                                         {isToday ? 'Hôm nay' : isPast ? 'Đã qua' : 'Sắp tới'}
                                      </span>
                                      <span className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3"/> {exam.date}</span>
                                   </div>
                                </div>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={() => handleExportWord(exam)} 
                                        disabled={isExportingWord}
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                        title="Xuất file Word"
                                    >
                                        <FileDown className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteExamClick(exam.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </div>
                             </div>
                             <div className="flex items-center gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3 mt-2">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {exam.duration}'</span>
                                <span className="flex items-center gap-1"><Layers className="w-3 h-3"/> {exam.variants} mã đề</span>
                                <span className="flex items-center gap-1 ml-auto text-indigo-600 font-medium">ID: {exam.id.slice(-6)}</span>
                             </div>
                          </div>
                       );
                    })}
                 </div>
              )}
           </div>
        </div>
      )}

      {/* STUDENT MANAGEMENT TAB */}
      {activeTab === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-left-4 duration-300">
           {/* Left: Add Student Form */}
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><UserPlus className="w-5 h-5 text-green-600"/> Thêm Học Sinh</h3>
                 <div className="space-y-4">
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Mã học sinh / ID (Bắt buộc)</label>
                        <input type="text" value={newStudentId} onChange={e => setNewStudentId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="VD: HS001" />
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Họ và tên</label>
                        <input type="text" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="VD: Nguyễn Văn A" />
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Lớp</label>
                            <input type="text" value={newStudentClass} onChange={e => setNewStudentClass(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="9A1" />
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Mật khẩu</label>
                            <input type="text" value={newStudentPass} onChange={e => setNewStudentPass(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Mặc định: 123" />
                         </div>
                     </div>
                     
                     <button onClick={handleAddStudentClick} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4"/> Thêm Học Sinh
                     </button>
                 </div>
              </div>

              {/* Bulk Import */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                 <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm"><CloudUpload className="w-4 h-4"/> Nhập nhanh từ CSV/Excel</h3>
                 <p className="text-xs text-slate-500 mb-3">Copy cột từ Excel và dán vào đây (ID, Pass, Tên, Lớp)</p>
                 <textarea 
                    className="w-full h-32 p-2 border rounded text-xs font-mono mb-3" 
                    placeholder={`HS01,123,Nguyễn Văn A,9A1\nHS02,123,Trần Thị B,8A2`}
                    value={importCsvText}
                    onChange={e => setImportCsvText(e.target.value)}
                 ></textarea>
                 <button onClick={handleBulkImportStudents} className="w-full py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition-all text-sm">
                    Xử lý & Thêm
                 </button>
              </div>
           </div>

           {/* Right: Student List */}
           <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2">
                       <Users className="w-5 h-5 text-slate-500"/> Danh Sách Học Sinh ({studentAccounts.length})
                   </h3>
                   <div className="relative w-64">
                       <input type="text" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" placeholder="Tìm kiếm..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                       <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                   </div>
               </div>

               <div className="overflow-x-auto max-h-[500px] overflow-y-auto border rounded-lg">
                   <table className="w-full text-sm text-left">
                       <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs sticky top-0">
                           <tr>
                               <th className="px-4 py-3">ID / Mã HS</th>
                               <th className="px-4 py-3">Mật khẩu</th>
                               <th className="px-4 py-3">Họ Tên</th>
                               <th className="px-4 py-3">Lớp</th>
                               <th className="px-4 py-3 text-right">Thao tác</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                           {filteredStudents.length === 0 ? (
                               <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Không tìm thấy học sinh nào.</td></tr>
                           ) : (
                               filteredStudents.map((st) => (
                                   <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                                       <td className="px-4 py-3 font-mono font-bold text-indigo-600">{st.id}</td>
                                       <td className="px-4 py-3 text-slate-500 font-mono">{st.password}</td>
                                       <td className="px-4 py-3 font-medium text-slate-700">{st.name}</td>
                                       <td className="px-4 py-3 text-slate-600">{st.className}</td>
                                       <td className="px-4 py-3 text-right">
                                           <button onClick={() => onDeleteStudent(st.id)} className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1.5 rounded transition-colors"><Trash2 className="w-4 h-4"/></button>
                                       </td>
                                   </tr>
                               ))
                           )}
                       </tbody>
                   </table>
               </div>
               
               <div className="mt-4 flex justify-end">
                   <button 
                     onClick={() => {
                        const content = studentAccounts.map(s => `${s.id}\t${s.password}\t${s.name}\t${s.className}`).join('\n');
                        navigator.clipboard.writeText(content);
                        alert("Đã copy danh sách vào bộ nhớ đệm!");
                     }}
                     className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                   >
                     <Copy className="w-3 h-3"/> Copy toàn bộ danh sách ra Excel
                   </button>
               </div>
           </div>
        </div>
      )}

      {/* AI Gen Tab Content */}
      {activeTab === 'ai-gen' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right-4 duration-300">
           {/* Left Panel: Configuration */}
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-600"/> Cấu hình AI</h3>
                 <div className="space-y-4">
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">API Key (Gemini)</label>
                       <div className="relative">
                          <input type="password" value={aiConfig.apiKey} onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})} className="w-full px-3 py-2 border rounded-lg pl-9 text-sm" placeholder="Paste Key..." />
                          <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                       </div>
                       <p className="text-[10px] text-slate-400 mt-1">Lấy key tại <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-indigo-500 underline">Google AI Studio</a></p>
                    </div>
                    {/* ... Rest of AI Config ... */}
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                       <button onClick={() => setAiMode('topic')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${aiMode === 'topic' ? 'bg-white shadow text-violet-700' : 'text-slate-500'}`}>Theo Chủ Đề</button>
                       <button onClick={() => setAiMode('file')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${aiMode === 'file' ? 'bg-white shadow text-violet-700' : 'text-slate-500'}`}>Từ File/Ảnh</button>
                    </div>
                    
                    {aiMode === 'topic' ? (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 block mb-1">Lớp</label>
                                    <select className="w-full p-2 border rounded-lg text-sm" value={aiConfig.grade} onChange={e => setAiConfig({...aiConfig, grade: e.target.value})}>
                                        <option value="6">6</option>
                                        <option value="7">7</option>
                                        <option value="8">8</option>
                                        <option value="9">9</option>
                                        {examAvailableClasses.filter(c => !['6','7','8','9'].includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 block mb-1">Mức độ</label>
                                    <select className="w-full p-2 border rounded-lg text-sm" value={aiConfig.difficulty} onChange={e => setAiConfig({...aiConfig, difficulty: e.target.value})}>
                                        <option value="Biết">Biết</option>
                                        <option value="Hiểu">Hiểu</option>
                                        <option value="Vận dụng">Vận dụng</option>
                                        <option value="Vận dụng cao">Vận dụng cao</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">Chủ đề</label>
                                <input list="topics-list" type="text" className="w-full p-2 border rounded-lg text-sm" value={aiConfig.topic} onChange={e => setAiConfig({...aiConfig, topic: e.target.value})} placeholder="Nhập hoặc chọn..." />
                                <datalist id="topics-list">
                                    {examAvailableTopics.map(t => <option key={t} value={t} />)}
                                </datalist>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">Bài học (Tùy chọn)</label>
                                <input list="lessons-list" type="text" className="w-full p-2 border rounded-lg text-sm" value={aiConfig.lesson} onChange={e => setAiConfig({...aiConfig, lesson: e.target.value})} placeholder="Chi tiết bài học..." />
                                <datalist id="lessons-list">{examAvailableLessons.map(l => <option key={l} value={l} />)}</datalist>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">Số lượng</label>
                                <input type="number" className="w-full p-2 border rounded-lg text-sm" min="1" max="20" value={aiConfig.count} onChange={e => setAiConfig({...aiConfig, count: Number(e.target.value)})} />
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <button onClick={() => setShowAiContext(!showAiContext)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline mb-2">
                                    {showAiContext ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>} Nguồn tài liệu tham khảo (Nâng cao)
                                </button>
                                
                                {showAiContext && (
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3 animate-in fade-in zoom-in-95">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 block mb-1">Văn bản nguồn (Copy/Paste)</label>
                                            <textarea className="w-full p-2 border rounded text-xs h-20" placeholder="Dán nội dung bài học/tài liệu vào đây để AI tham khảo..." value={aiContextText} onChange={e => setAiContextText(e.target.value)}></textarea>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 block mb-1">Hoặc Tải File (Ảnh/PDF)</label>
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded cursor-pointer hover:bg-slate-50 text-xs">
                                                    <CloudUpload className="w-3 h-3"/> Chọn File
                                                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleContextFileChange} />
                                                </label>
                                                {aiContextFileName && <span className="text-[10px] text-green-600 truncate max-w-[150px]">{aiContextFileName}</span>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <label className="text-xs font-bold text-slate-500 block mb-1">Gợi ý bổ sung (Prompt)</label>
                                <textarea className="w-full p-2 border rounded-lg text-xs h-16" placeholder="VD: Tập trung vào bài toán thực tế, tránh số lẻ..." value={aiConfig.additionalPrompt} onChange={e => setAiConfig({...aiConfig, additionalPrompt: e.target.value})}></textarea>
                            </div>

                            <button onClick={handleGenerateAI} disabled={isGenerating} className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin"/> : <Sparkles className="w-5 h-5"/>} Tạo Câu Hỏi
                            </button>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-center">
                                <CloudUpload className="w-8 h-8 text-slate-400 mx-auto mb-2"/>
                                <p className="text-xs text-slate-500 mb-3">Chụp ảnh đề bài hoặc dán văn bản để AI trích xuất.</p>
                                
                                <div className="flex flex-col gap-3">
                                    <label className="w-full py-2 bg-white border border-slate-300 text-slate-600 font-bold rounded-lg cursor-pointer hover:bg-slate-50 text-xs flex items-center justify-center gap-2">
                                        <ImageIcon className="w-4 h-4"/> Chọn Ảnh (JPG/PNG)
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                    </label>
                                    {uploadMimeType && <div className="text-xs text-green-600 font-medium">Đã chọn ảnh</div>}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">Hoặc Dán Văn Bản</label>
                                <textarea className="w-full p-3 border rounded-lg text-sm h-32" placeholder="Paste nội dung câu hỏi vào đây..." value={uploadText} onChange={e => setUploadText(e.target.value)}></textarea>
                            </div>
                            
                            <button onClick={handleExtractFromInput} disabled={isGenerating} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin"/> : <FileType className="w-5 h-5"/>} Trích Xuất Ngay
                            </button>
                        </div>
                    )}
                 </div>
              </div>
           </div>

           {/* Right Panel */}
           <div className="lg:col-span-2 bg-slate-50 rounded-2xl border border-slate-200 p-6 h-fit min-h-[500px]">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2">
                       <ListPlus className="w-5 h-5 text-slate-500"/> Danh sách câu hỏi ({generatedQuestions.length})
                   </h3>
                   {generatedQuestions.length > 0 && (
                       <div className="flex gap-2">
                           <button onClick={handleCopyAIToExcel} className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 flex items-center gap-1"><Copy className="w-3 h-3"/> Copy Excel</button>
                           <button onClick={handleSaveAIQuestions} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 flex items-center gap-1"><CloudUpload className="w-3 h-3"/> Lưu Vào Kho</button>
                           <button onClick={() => setGeneratedQuestions([])} className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-bold rounded hover:bg-red-200">Xóa</button>
                       </div>
                   )}
               </div>

               {generatedQuestions.length === 0 ? (
                   <div className="text-center py-20 text-slate-400">
                       <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                       <p>Chưa có câu hỏi nào được tạo.</p>
                   </div>
               ) : (
                   <div className="space-y-4">
                       {generatedQuestions.map((q, i) => (
                           <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm group">
                               {editingIndex === i && editForm ? (
                                   <div className="space-y-3">
                                       <div className="flex gap-2">
                                           <input type="text" className="flex-1 p-2 border rounded text-sm font-bold" value={editForm.cauHoi} onChange={e => setEditForm({...editForm, cauHoi: e.target.value})} placeholder="Câu hỏi"/>
                                           <select className="p-2 border rounded text-sm w-24" value={editForm.dapAnDung} onChange={e => setEditForm({...editForm, dapAnDung: e.target.value as any})}>
                                               <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                                           </select>
                                       </div>
                                       <div className="relative">
                                           <input type="text" className="w-full p-2 border rounded text-xs text-blue-600" value={editForm.linkAnh} onChange={handleLinkAnhChange} placeholder="Link ảnh (Google Drive/Imgur)..."/>
                                           {getDisplayImageUrl(editForm.linkAnh) && (
                                               <div className="mt-2 p-2 bg-slate-100 rounded border border-slate-200 flex justify-center">
                                                   <img src={getDisplayImageUrl(editForm.linkAnh)} alt="Preview" className="h-24 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')}/>
                                               </div>
                                           )}
                                       </div>
                                       <div className="grid grid-cols-2 gap-2">
                                           <input type="text" className="p-2 border rounded text-xs" value={editForm.dapAnA} onChange={e => setEditForm({...editForm, dapAnA: e.target.value})} placeholder="A"/>
                                           <input type="text" className="p-2 border rounded text-xs" value={editForm.dapAnB} onChange={e => setEditForm({...editForm, dapAnB: e.target.value})} placeholder="B"/>
                                           <input type="text" className="p-2 border rounded text-xs" value={editForm.dapAnC} onChange={e => setEditForm({...editForm, dapAnC: e.target.value})} placeholder="C"/>
                                           <input type="text" className="p-2 border rounded text-xs" value={editForm.dapAnD} onChange={e => setEditForm({...editForm, dapAnD: e.target.value})} placeholder="D"/>
                                       </div>
                                       <textarea className="w-full p-2 border rounded text-xs" value={editForm.loiGiai} onChange={e => setEditForm({...editForm, loiGiai: e.target.value})} placeholder="Lời giải chi tiết..."></textarea>
                                       <div className="flex justify-end gap-2">
                                           <button onClick={saveEditQuestion} className="px-3 py-1 bg-green-600 text-white text-xs rounded font-bold">Lưu</button>
                                           <button onClick={cancelEdit} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs rounded font-bold">Hủy</button>
                                       </div>
                                   </div>
                               ) : (
                                   <>
                                       <div className="flex justify-between items-start mb-2">
                                           <div className="flex gap-2">
                                               <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold">{q.mucDo}</span>
                                               <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold">{q.bai}</span>
                                           </div>
                                           <button onClick={() => startEditQuestion(q, i)} className="text-slate-300 hover:text-indigo-600"><PenSquare className="w-4 h-4"/></button>
                                       </div>
                                       <div className="font-medium text-slate-800 text-sm mb-2"><MathRenderer text={q.cauHoi}/></div>
                                       
                                       {getDisplayImageUrl(q.linkAnh) && (
                                            <div className="mb-2">
                                                <img src={getDisplayImageUrl(q.linkAnh)} alt="Illustration" className="h-20 object-contain rounded border border-slate-200" onError={(e) => (e.currentTarget.style.display = 'none')}/>
                                            </div>
                                       )}

                                       <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 mb-2">
                                           <div className={q.dapAnDung==='A'?'text-green-600 font-bold':''}><span className="font-bold">A.</span> <MathRenderer text={q.dapAnA} inline/></div>
                                           <div className={q.dapAnDung==='B'?'text-green-600 font-bold':''}><span className="font-bold">B.</span> <MathRenderer text={q.dapAnB} inline/></div>
                                           <div className={q.dapAnDung==='C'?'text-green-600 font-bold':''}><span className="font-bold">C.</span> <MathRenderer text={q.dapAnC} inline/></div>
                                           <div className={q.dapAnDung==='D'?'text-green-600 font-bold':''}><span className="font-bold">D.</span> <MathRenderer text={q.dapAnDung} inline/></div>
                                       </div>
                                       <div className="text-[10px] text-slate-400 truncate">LG: <MathRenderer text={q.loiGiai.substring(0, 100) + '...'} inline/></div>
                                   </>
                               )}
                           </div>
                       ))}
                   </div>
               )}

               {generatedQuestions.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-200 bg-white p-4 rounded-xl shadow-sm">
                      <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                          <Repeat className="w-4 h-4 text-orange-500"/> Tạo thêm câu hỏi tương tự
                      </h4>
                      <div className="flex gap-2 items-center">
                          <span className="text-xs text-slate-500">Số lượng:</span>
                          <input type="number" min="1" max="50" className="w-16 p-1.5 border rounded text-sm text-center" value={similarCount} onChange={e => setSimilarCount(Number(e.target.value))}/>
                          <button onClick={handleGenerateSimilar} disabled={isGeneratingSimilar} className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                              {isGeneratingSimilar ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Tạo Ngay
                          </button>
                      </div>
                  </div>
               )}
           </div>
        </div>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-right-4 duration-300">
           <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-600"/> Kết Quả Bài Làm ({submissions.length})</h3>
              <div className="flex gap-3 w-full md:w-auto">
                 <div className="relative flex-1 md:w-64">
                    <input type="text" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" placeholder="Tìm tên, lớp, bài thi..." value={resultSearch} onChange={e => setResultSearch(e.target.value)} />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                 </div>
                 <button onClick={handleCopyToExcel} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 whitespace-nowrap"><Copy className="w-4 h-4"/> Copy Điểm</button>
                 <button onClick={onClearSubmissions} className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 text-sm font-bold rounded-lg whitespace-nowrap">Xóa Lịch Sử</button>
              </div>
           </div>
           
           <div className="bg-slate-50 p-4 rounded-xl mb-6 flex gap-8 items-center border border-slate-100">
              <div>
                  <div className="text-xs text-slate-500 font-bold uppercase">Tổng lượt thi</div>
                  <div className="text-2xl font-bold text-slate-800">{submissions.length}</div>
              </div>
              <div>
                  <div className="text-xs text-slate-500 font-bold uppercase">Điểm trung bình</div>
                  <div className="text-2xl font-bold text-indigo-600">{overallAvg}</div>
              </div>
           </div>

           <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                 <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs">
                    <tr>
                       <th className="px-4 py-3 rounded-l-lg">Thời gian</th>
                       <th className="px-4 py-3">Học sinh</th>
                       <th className="px-4 py-3">Lớp</th>
                       <th className="px-4 py-3">Bài thi</th>
                       <th className="px-4 py-3 text-center">Câu đúng</th>
                       <th className="px-4 py-3 rounded-r-lg text-right">Điểm</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {filteredSubmissions.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Không tìm thấy kết quả nào.</td></tr>
                    ) : (
                        filteredSubmissions.slice().reverse().map(sub => (
                           <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-slate-500">{new Date(sub.submittedAt).toLocaleString('vi-VN')}</td>
                              <td className="px-4 py-3 font-bold text-slate-700">{sub.studentName}</td>
                              <td className="px-4 py-3 text-slate-600">{sub.className}</td>
                              <td className="px-4 py-3 text-indigo-600 font-medium">{sub.examTitle}</td>
                              <td className="px-4 py-3 text-center text-slate-600">{sub.correctCount}/{sub.totalQuestions}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-800">{sub.score.toFixed(1)}</td>
                           </tr>
                        ))
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;