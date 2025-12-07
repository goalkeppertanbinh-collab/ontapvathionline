
import { Question, ExamConfig, StudentAccount } from '../types';

// 1. NGÂN HÀNG CÂU HỎI (ÔN TẬP & TẠO ĐỀ) - TOÁN THCS (6, 7, 8, 9)
export const INITIAL_QUESTIONS: Question[] = [
  // --- LỚP 6 ---
  {
    id: "q-001",
    lop: "6",
    chuDe: "Số học",
    bai: "Phân số",
    mucDo: "Biết",
    cauHoi: "Kết quả của phép tính $\\dfrac{3}{4} + \\dfrac{1}{4}$ là:",
    linkAnh: "", 
    dapAnA: "$\\dfrac{1}{2}$",
    dapAnB: "$1$",
    dapAnC: "$\\dfrac{4}{8}$",
    dapAnD: "$\\dfrac{3}{16}$",
    dapAnDung: "B",
    goiY: "Cộng hai phân số cùng mẫu: giữ nguyên mẫu, cộng tử.",
    loiGiai: "$\\dfrac{3}{4} + \\dfrac{1}{4} = \\dfrac{3+1}{4} = \\dfrac{4}{4} = 1$."
  },
  {
    id: "q-002",
    lop: "6",
    chuDe: "Hình học",
    bai: "Điểm và đường thẳng",
    mucDo: "Hiểu",
    cauHoi: "Cho 3 điểm A, B, C thẳng hàng theo thứ tự đó. Khẳng định nào sau đây đúng?",
    dapAnA: "Điểm A nằm giữa B và C",
    dapAnB: "Điểm C nằm giữa A và B",
    dapAnC: "Điểm B nằm giữa A và C",
    dapAnD: "Ba điểm không thẳng hàng",
    dapAnDung: "C",
    goiY: "Vẽ hình minh họa 3 điểm theo thứ tự A, B, C.",
    loiGiai: "Theo thứ tự A, B, C thì điểm B nằm giữa hai điểm A và C."
  },
  
  // --- LỚP 7 ---
  {
    id: "q-003",
    lop: "7",
    chuDe: "Đại số",
    bai: "Tỉ lệ thức",
    mucDo: "Vận dụng",
    cauHoi: "Tìm $x$ biết: $\\dfrac{x}{4} = \\dfrac{3}{2}$",
    dapAnA: "$x = 6$",
    dapAnB: "$x = 5$",
    dapAnC: "$x = 8$",
    dapAnD: "$x = 3$",
    dapAnDung: "A",
    goiY: "Sử dụng tính chất tỉ lệ thức: Nhân chéo chia ngang ($x = 4 \\cdot 3 : 2$).",
    loiGiai: "$\\dfrac{x}{4} = \\dfrac{3}{2} \\Rightarrow x = \\dfrac{4 \\cdot 3}{2} = \\dfrac{12}{2} = 6$."
  },

  // --- LỚP 8 ---
  {
    id: "q-004",
    lop: "8",
    chuDe: "Đại số",
    bai: "Hằng đẳng thức",
    mucDo: "Hiểu",
    cauHoi: "Khai triển hằng đẳng thức $(x - 2)^2$ ta được:",
    dapAnA: "$x^2 - 4$",
    dapAnB: "$x^2 - 2x + 4$",
    dapAnC: "$x^2 - 4x + 4$",
    dapAnD: "$x^2 + 4x + 4$",
    dapAnDung: "C",
    goiY: "Áp dụng $(A-B)^2 = A^2 - 2AB + B^2$.",
    loiGiai: "$(x - 2)^2 = x^2 - 2 \\cdot x \\cdot 2 + 2^2 = x^2 - 4x + 4$."
  },

  // --- LỚP 9 ---
  {
    id: "q-005",
    lop: "9",
    chuDe: "Đại số",
    bai: "Căn bậc hai",
    mucDo: "Biết",
    cauHoi: "Căn bậc hai số học của 9 là:",
    dapAnA: "3",
    dapAnB: "-3",
    dapAnC: "$\\pm 3$",
    dapAnD: "81",
    dapAnDung: "A",
    goiY: "Căn bậc hai số học của số dương $a$ là số dương $x$ sao cho $x^2 = a$.",
    loiGiai: "Căn bậc hai số học của 9 là $\\sqrt{9} = 3$."
  },
  {
    id: "q-006",
    lop: "9",
    chuDe: "Hình học",
    bai: "Hệ thức lượng",
    mucDo: "Vận dụng",
    cauHoi: "Cho tam giác ABC vuông tại A, đường cao AH. Biết BH = 4, CH = 9. Độ dài đường cao AH là:",
    dapAnA: "13",
    dapAnB: "6",
    dapAnC: "36",
    dapAnD: "6.5",
    dapAnDung: "B",
    goiY: "Sử dụng hệ thức lượng $AH^2 = BH \\cdot CH$.",
    loiGiai: "$AH^2 = BH \\cdot CH = 4 \\cdot 9 = 36 \\Rightarrow AH = \\sqrt{36} = 6$."
  }
];

// 2. DANH SÁCH ĐỀ THI (CẤU HÌNH SẴN)
export const INITIAL_EXAMS: ExamConfig[] = [
  {
    id: "exam-thcs-01",
    title: "Kiểm tra 15 phút Toán 9 - Chương 1",
    date: new Date().toISOString().split('T')[0],
    duration: 15,
    variants: 1,
    sections: [],
    // Đề mẫu cho lớp 9
    specificQuestions: [
        INITIAL_QUESTIONS[4], // Câu căn bậc 2
        INITIAL_QUESTIONS[5]  // Câu hình học
    ],
    questionCount: 2,
    targetClass: "9",
    shuffleQuestions: true,
    shuffleAnswers: true,
    allowDuplicates: false,
    allowReview: true,
    hideTakenVariants: false,
    createdAt: Date.now()
  }
];

// 3. TÀI KHOẢN HỌC SINH
export const INITIAL_STUDENTS: StudentAccount[] = [
  {
    id: "hs01",
    password: "123",
    name: "Lê Văn Tám",
    className: "6A1"
  },
  {
    id: "hs02",
    password: "123",
    name: "Trần Thị Lan",
    className: "9A2"
  },
  {
    id: "hs03",
    password: "123",
    name: "Nguyễn Ngọc Minh",
    className: "8A"
  }
];
