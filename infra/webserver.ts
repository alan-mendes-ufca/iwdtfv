// Usado pelos testes de integração para montar a URL da API.
function getOrigin() {
  return process.env.WEBSERVER_ORIGIN || "http://localhost:3000";
}

const webserver = {
  origin: getOrigin(),
};

export default webserver;
