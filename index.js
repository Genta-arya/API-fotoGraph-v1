const express = require("express");
const db = require("./Koneksi");
const bodyParser = require("body-parser");
const app = express();
const port = 3005;
const cors = require("cors");
const jwt = require("jsonwebtoken");

const multer = require("multer");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const midtransClient = require("midtrans-client");

function generateUID() {
  const timestamp = new Date().getTime().toString();
  const randomString = Math.random().toString(36).substring(2, 6);
  const uid = timestamp + randomString;
  return uid;
}

function authenticate(req, res, next) {
 
  const authToken = req.headers.authorization;

  if (authToken && authToken === 'Bearer OmyooData') {
    next(); 
  } else {
    res.status(401).json({ status: '401' , message: "Tidak dapat mengakses data anda tidak memiliki Authorization"});
  }
}


app.get("/orders", authenticate, (req, res) => {
  const getUsersQuery = "SELECT * FROM orders";
  db.query(getUsersQuery, (error, results) => {
    if (error) {
      console.error(error);
      res.sendStatus(500);
    } else {
      res.status(200).json(results);
    }
  });
});

app.post("/order", async (req, res) => {
  const {
    id_product,
    nm_product,
    price,
    name,
    contact,
    address,
    email,
    date,
    time,
  } = req.body;

  if (
    !id_product ||
    !nm_product ||
    !price ||
    !name ||
    !contact ||
    !address ||
    !email ||
    !date ||
    !time
  ) {
    console.log("Please fill in all fields");

    return res.status(400).json({ error: "Please fill in all fields" });
  }
  console.log(price);
  const requestedOrderTime = new Date(`${date}T${time}`).getTime();

  const findPreviousOrderQuery =
    "SELECT MAX(CONCAT(date, ' ', time)) AS maxDateTime FROM orders WHERE date = ?";
  const values = [date];

  db.query(findPreviousOrderQuery, values, async (error, results) => {
    if (error) {
      console.error("Error searching for previous order:", error);
      return res
        .status(500)
        .json({ error: "Error searching for previous order" });
    }

    const maxDateTime = results[0].maxDateTime;

    if (maxDateTime) {
      const previousOrderTime = new Date(maxDateTime).getTime();
      const timeDifferenceMillis = requestedOrderTime - previousOrderTime;
      const minimumTimeDifferenceMillis = 45 * 60 * 1000;

      if (timeDifferenceMillis <= minimumTimeDifferenceMillis) {
        console.log("Waktu pemesanan tidak diizinkan");
        return res
          .status(400)
          .json({ error: "Waktu pemesanan tidak diizinkan" });
      }
    }
    const deletePreviousOrderQuery =
      "DELETE FROM orders WHERE CONCAT(date, ' ', time) < ? AND date = ?";
    const deleteValues = [new Date().toISOString(), date];

    db.query(
      deletePreviousOrderQuery,
      deleteValues,
      (deleteError, deleteResults) => {
        if (deleteError) {
          console.error("Error deleting previous orders:", deleteError);
        }
        console.log("Previous orders deleted:", deleteResults);
      }
    );

    const snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: "SB-Mid-server-BGYfA4SBqkbbDqAgycBbBqIB",
      clientKey: "SB-Mid-client-LAESY4DvSHanXr5C",
    });

    const transactionDetails = {
      order_id: `ORDER_${Math.round(Math.random() * 100000)}`,
      gross_amount: price,
      email: email,
    };

    const transaction = {
      transaction_details: transactionDetails,
      customer_details: {
        email: email,
        first_name: name,
      },
    };

    try {
      const transactionToken = await snap.createTransaction(transaction);
      const paymentToken = transactionToken.token;
      console.log("Payment token:", paymentToken);

      const paymentData = {
        transaction_details: transactionDetails,
        customer_details: {
          email: email,
          first_name: name,
        },
        seller_details: {
          id: "sellerId-01",
          name: "Ario Novrian",
          email: "omyoo@studio.com",
          url: "https://www.omyoo-studio.online/",
          address: {
            first_name: "Ario",
            last_name: "Novrian",
            phone: "089680768061",
            address: "Jl Karya Tani",
            city: "Ketapang",
            postal_code: "78813",
            country_code: "IDN",
          },
        },

        item_details: [
          {
            price: price,
            quantity: 1,
            name: nm_product,
          },
        ],
      };

      const paymentResponse = await snap.createTransaction(paymentData);
      const redirectUrl = paymentResponse.redirect_url;

      const insertOrderQuery =
        "INSERT INTO orders (order_id, id_product, nm_product, price, name, contact, addres, email, date, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      const values = [
        transactionDetails.order_id,
        id_product,
        nm_product,
        price,
        name,
        contact,
        address,
        email,
        date,
        time,
      ];

      db.query(insertOrderQuery, values, (error, results) => {
        if (error) {
          console.error("Error placing order:", error);

          return res.status(500).json({ error: "Error placing order" });
        }
        console.log("Order placed successfully:", results);

        res
          .status(200)
          .json({ order_id: transactionDetails.order_id, redirectUrl });
      });
    } catch (error) {
      console.error("Failed to create transaction:", error);
      res.status(500).json({ error: "Failed to create transaction" });
    }
    lastOrderTime = requestedOrderTime;
  });
});

app.get("/order-status/:order_id", (req, res) => {
  const { order_id } = req.params;

  const getOrderStatusQuery = "SELECT * FROM orders WHERE order_id = ?";
  const values = [order_id];

  db.query(getOrderStatusQuery, values, (error, results) => {
    if (error) {
      console.error("Error querying order status:", error);
      return res.status(500).json({ error: "Error querying order status" });
    }

    if (results.length === 0) {
      console.log("Order not found");
      return res.status(404).json({ error: "Order not found" });
    }

    const orderStatus = results[0].status;

    res.status(200).json({ order_id, status: orderStatus });
  });
});

app.post("/midtrans-callback", (req, res) => {
  const { order_id, transaction_status, fraud_status } = req.body;

  let status = "";

  switch (transaction_status) {
    case "capture":
      status = "captured";
      break;
    case "settlement":
      status = "settled";
      break;
    case "pending":
      status = "pending";
      break;
    case "cancel":
      status = "canceled";
      break;
    case "expire":
      status = "expired";
      break;
    default:
      console.log(
        `Unknown transaction status for order ${order_id}: ${transaction_status}`
      );
      break;
  }

  if (status) {
    const updateStatusQuery = "UPDATE orders SET status = ? WHERE order_id = ?";
    const values = [status, order_id];

    db.query(updateStatusQuery, values, (error, results) => {
      if (error) {
        console.error(`Error updating status for order ${order_id}:`, error);
        res
          .status(500)
          .json({ error: `Error updating status for order ${order_id}` });
      } else {
        console.log(`Status updated for order ${order_id} to: ${status}`);
        res.sendStatus(200);
      }
    });
  } else {
    res.sendStatus(200);
  }
});

// Endpoint untuk login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  console.log(`Email: ${email}, Password: ${password}`);

  const getUserQuery = "SELECT * FROM auth WHERE email = ?";
  db.query(getUserQuery, [email], (error, results) => {
    if (error) {
      console.error(error);
      res.sendStatus(500);
    } else {
      if (results.length === 0) {
        res.status(401).json({ message: "Email atau password salah" });
      } else {
        const user = results[0];
        if (password === user.password) {
          const token = jwt.sign(
            { userId: user.uid, email: user.email },
            "rahasia-kunci-jwt",
            { expiresIn: "1h" }
          );

          const insertTokenQuery =
            "UPDATE auth SET token_jwt = ? WHERE uid = ?";
          db.query(
            insertTokenQuery,
            [token, user.uid],
            (insertError, insertResults) => {
              if (insertError) {
                console.error(insertError);
                res.sendStatus(500);
              } else {
                res
                  .status(200)
                  .json({ message: "login", token, username: user.username });
              }
            }
          );
        } else {
          res.status(401).json({ message: "Email atau password salah" });
        }
      }
    }
  });
});

app.post("/get-username", (req, res) => {
  const { email } = req.body;

  const getUserQuery = "SELECT username FROM auth WHERE email = ?";
  db.query(getUserQuery, [email], (error, results) => {
    if (error) {
      console.error(error);
      res.sendStatus(500);
    } else {
      if (results.length === 0) {
        res.status(404).json({ message: "User not found" });
      } else {
        const username = results[0].username;
        res.status(200).json({ username });
      }
    }
  });
});

app.post("/register", (req, res) => {
  const { username, password, email } = req.body;

  const uid = generateUID();

  const insertUserQuery =
    "INSERT INTO auth (uid, username, email, password) VALUES (?, ?, ?, ?)";
  db.query(
    insertUserQuery,
    [uid, username, email, password],
    (error, results) => {
      if (error) {
        console.error("Error saat mendaftarkan pengguna:", error);
        res.sendStatus(500);
      } else {
        console.log("Pengguna berhasil terdaftar");
        res.sendStatus(200);
      }
    }
  );
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: "putrabahari1006@gmail.com",
      pass: "taletpsmoesjdjfq",
    },
  });

  const generateResetToken = () => {
    const token = crypto.randomBytes(3).toString("hex");
    return token;
  };

  try {
    const resetToken = generateResetToken();
    console.log(resetToken);

    const insertTokenQuery = `UPDATE auth SET otp = ? WHERE email = ?`;
    const insertTokenValues = [resetToken, email];

    const mailOptions = {
      from: "omYoo@Studio.com",
      to: email,
      subject: "Reset Password",
      html: `
        <html>
          <head>
            <style>
              /* Tambahkan CSS kustom Anda di sini */
              body {
                font-family: Arial, sans-serif;
                background-color: #f0f0f0;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #ffffff;
              }
              .header {
                background-color: #007BFF;
                color: #ffffff;
                padding: 10px 0;
                text-align: center;
              }
              .content {
                padding: 20px;
              }
              .footer {
                background-color: #007BFF;
                color: #ffffff;
                padding: 10px 0;
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Reset Password</h1>
              </div>
              <div class="content">
                <p>Halo,</p>
                <p>Anda telah meminta untuk mereset password Anda. Gunakan token berikut untuk mereset password:</p>
                <p><strong>Token:</strong> ${resetToken}</p>
                <p>Jika Anda tidak melakukan permintaan ini, silakan abaikan email ini.</p>
                <p>Salam,</p>
                <p>Terima Kasih</p>
              </div>
              <div class="footer">
                &copy; ${new Date().getFullYear()} omYoo Studio
              </div>
            </div>
          </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);

    db.query(insertTokenQuery, insertTokenValues, (error, results) => {
      if (error) {
        console.error(error);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.delete("/delete-token", (req, res) => {
  const { email } = req.body;
  const deleteTokenQuery = `UPDATE auth SET otp = NULL WHERE email = ?`;
  const deleteTokenValues = [email];

  db.query(deleteTokenQuery, deleteTokenValues, (error, results) => {
    if (error) {
      console.error("Error deleting token:", error);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      console.log("Token deleted successfully");
      res.sendStatus(200);
    }
  });
});

app.post("/verify-token", (req, res) => {
  const { otp, email } = req.body;
  const selectOTPQuery = "SELECT otp FROM auth WHERE email = ?";

  db.query(selectOTPQuery, [email], (selectError, selectResults) => {
    if (selectError) {
      console.error(selectError);
      res.sendStatus(500);
    } else {
      if (selectResults.length > 0) {
        const storedOTP = selectResults[0].otp;

        if (storedOTP === otp) {
          res.sendStatus(200);
        } else {
          console.log(otp);
          res.sendStatus(400);
        }
      } else {
        console.log("Email not found");
        res.sendStatus(400);
      }
    }
  });
});

app.post("/update-password", (req, res) => {
  const { email, newPassword } = req.body;
  const updatePasswordQuery = "UPDATE auth SET password = ? WHERE email = ?";
  const updatePasswordValues = [newPassword, email];

  db.query(updatePasswordQuery, updatePasswordValues, (error, results) => {
    if (error) {
      console.error("Error updating password:", error);
      res.sendStatus(500);
    } else {
      console.log("Password updated successfully");
      res.sendStatus(200);
    }
  });
});

app.post("/check-email", (req, res) => {
  const { email } = req.body;

  const sql = "SELECT * FROM auth WHERE email = ?";
  db.query(sql, [email], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    if (result.length > 0) {
      res.status(200).json({ exists: true });
    } else {
      res.status(200).json({ exists: false });
    }
  });
});

app.listen(port, () => {
  console.log(`Server berjalan `);
});
