// Fonte única do contrato de mensagens do gbml — barrel dos domínios em
// protocol/*. O host implementa o mesmo contrato em
// host/Sources/GbmlHost/HostRuntime.swift (roteador) e Modules/*.
export * from "./protocol/envelope";
export * from "./protocol/translator";
export * from "./protocol/interno";
export * from "./protocol/shell";
