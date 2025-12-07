
import { Question, ExamConfig, StudentAccount } from '../types';

// 1. NGÂN HÀNG CÂU HỎI (ÔN TẬP & TẠO ĐỀ)
export const INITIAL_QUESTIONS: Question[] = [
  {
    id: "q-001",
    lop: "12",
    chuDe: "Hàm số",
    bai: "Cực trị",
    mucDo: "Biết",
    cauHoi: "Cho hàm số $y = f(x)$ có bảng biến thiên như sau. Hàm số đạt cực đại tại điểm nào?",
    linkAnh: "https://i.imgur.com/Kj7Xy8q.png", // Ảnh minh họa (ví dụ)
    dapAnA: "x = 1",
    dapAnB: "x = 2",
    dapAnC: "x = 3",
    dapAnD: "x = 0",
    dapAnDung: "A",
    goiY: "Nhìn vào bảng biến thiên, điểm cực đại là nơi y' đổi dấu từ dương sang âm.",
    loiGiai: "Dựa vào bảng biến thiên, hàm số đạt cực đại tại $x = 1$."
  },
  {
    id: "q-002",
    lop: "12",
    chuDe: "Hàm số",
    bai: "Đơn điệu",
    mucDo: "Hiểu",
    cauHoi: "Hàm số $y = x^3 - 3x + 1$ nghịch biến trên khoảng nào?",
    dapAnA: "$(0; 2)$",
    dapAnB: "$(-1; 1)$",
    dapAnC: "$(-\\infty; -1)$",
    dapAnD: "$(1; +\\infty)$",
    dapAnDung: "B",
    goiY: "Tính đạo hàm $y'$ và tìm nghiệm của $y' < 0$.",
    loiGiai: "$y' = 3x^2 - 3$. Cho $y' < 0 \\Leftrightarrow x^2 - 1 < 0 \\Leftrightarrow -1 < x < 1$."
  },
  {
    id: "q-003",
    lop: "12",
    chuDe: "Mũ - Logarit",
    bai: "Logarit",
    mucDo: "Vận dụng",
    cauHoi: "Giải phương trình $\\log_2(x-1) = 3$.",
    dapAnA: "x = 9",
    dapAnB: "x = 7",
    dapAnC: "x = 8",
    dapAnD: "x = 10",
    dapAnDung: "A",
    goiY: "Sử dụng định nghĩa logarit: $\\log_a b = c \\Rightarrow b = a^c$.",
    loiGiai: "Điều kiện $x > 1$. Phương trình $\\Leftrightarrow x - 1 = 2^3 \\Leftrightarrow x - 1 = 8 \\Leftrightarrow x = 9$."
  },
  // Thêm dữ liệu mẫu khác tại đây...
];

// 2. DANH SÁCH ĐỀ THI (CẤU HÌNH SẴN)
export const INITIAL_EXAMS: ExamConfig[] = [
  {
    id: "exam-demo-01",
    title: "Kiểm tra 15 phút - Hàm số",
    date: new Date().toISOString().split('T')[0],
    duration: 15,
    variants: 1,
    sections: [],
    // Đề thi này đã được "trộn sẵn" danh sách câu hỏi cụ thể
    specificQuestions: [
        INITIAL_QUESTIONS[0],
        INITIAL_QUESTIONS[1]
    ],
    questionCount: 2,
    targetClass: "12",
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
    name: "Nguyễn Văn A",
    className: "12A1"
  },
  {
    id: "hs02",
    password: "123",
    name: "Trần Thị B",
    className: "12A2"
  }
];
