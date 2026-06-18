import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { User } from '../types';

export const getISTDateTimeString = (): string => {
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = String(istDate.getDate()).padStart(2, '0');
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const year = istDate.getFullYear();
    const hours = String(istDate.getHours()).padStart(2, '0');
    const minutes = String(istDate.getMinutes()).padStart(2, '0');
    const seconds = String(istDate.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} | ${hours}:${minutes}:${seconds} | UTC+5:30`;
};

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
    if ((req.session as any).user) {
        next();
    } else {
        res.status(401).json({ message: "Unauthorized: Please log in." });
    }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req.session as any).user as User;
    if (user && user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ message: "Forbidden: Administrator access required." });
    }
};

const uploadDir = path.join(__dirname, '..', '..', 'public', 'lab_reports');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `report-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

export const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (file.mimetype === 'application/pdf' || ext === '.pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed'));
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

export const excelUpload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.originalname.match(/\.(xlsx|xls)$/)) cb(null, true);
        else cb(new Error('Only Excel files are allowed'));
    },
    limits: { fileSize: 50 * 1024 * 1024 }
});
