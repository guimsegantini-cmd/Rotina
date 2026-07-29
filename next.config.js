/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Evita que o navegador guarde em cache uma resposta antiga (ex: um
        // 404 de antes do worker existir em public/), o que faria a leitura
        // de PDF continuar falhando mesmo depois do deploy corrigido.
        source: "/pdf.worker.min.mjs",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

module.exports = nextConfig;
