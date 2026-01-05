import type { Context } from "hono";
import { query } from "../db/client.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key-change-this";

/**
 * Signup Route
 */
export async function signupRoute(c: Context) {
    try {
        const { name, email, password } = await c.req.json();

        if (!name || !email || !password) {
            return c.json({ ok: false, error: "Missing required fields" }, 400);
        }

        // Check if user already exists
        const existingUser = await query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.length > 0) {
            return c.json({ ok: false, error: "Email already registered" }, 400);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert user
        const newUserResult = await query(
            "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
            [name, email, hashedPassword]
        );

        const newUser = newUserResult[0];

        // Generate token
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        return c.json({
            ok: true,
            message: "User created successfully",
            token,
            user: newUser
        });

    } catch (error: any) {
        console.error("❌ Signup error:", error);
        return c.json({ ok: false, error: "Signup failed", details: error.message }, 500);
    }
}

/**
 * Login Route
 */
export async function loginRoute(c: Context) {
    try {
        const { email, password } = await c.req.json();

        if (!email || !password) {
            return c.json({ ok: false, error: "Missing required fields" }, 400);
        }

        // Find user
        const userResult = await query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        if (userResult.length === 0) {
            return c.json({ ok: false, error: "Invalid email or password" }, 401);
        }

        const user = userResult[0];

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return c.json({ ok: false, error: "Invalid email or password" }, 401);
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        return c.json({
            ok: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error: any) {
        console.error("❌ Login error:", error);
        return c.json({ ok: false, error: "Login failed", details: error.message }, 500);
    }
}
